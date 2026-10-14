import Foundation

/// Pinger simulado para demos y desarrollo sin hardware (spec 003, research R-6).
///
/// Habla el mismo protocolo de líneas que el firmware y lo imita en lo que importa a la app:
/// - cada `PING` tarda ≈ 1.4 s en dar su `P,` (ToA 177 ms + ventana de recepción de 1207 ms);
/// - un `PING` con otro pendiente responde `!ERR state busy`; sin hash, `!ERR state nohash`;
/// - respeta el límite de TX del 10 % en 60 s y avisa con `#WARN duty_wait <ms>` cuando retrasa un TX.
///
/// El SNR de subida sigue un patrón de Yagi en función del ángulo entre el rumbo del teléfono y el
/// azimut al repetidor: G(δ) = 10·log10(max(cos(δ/2)^(2n), 10^(−FB/10))).
final class SimulatedPinger: LineTransport, @unchecked Sendable {
    struct Config {
        var snr0 = 8.0                 // dB de SNR de subida en el centro del haz
        var n = 8.0                    // haz de −3 dB en ±33.5° (≈ Yagi de 3 elementos)
        var frontToBackDB = 12.0
        var noiseSigma = 0.75          // dB
        var lossProbability = 0.05
        var delayScale = 1.0           // 1 = tiempos reales; <1 acelera las demos
        var seed: UInt64 = 1
    }

    private(set) var state: LinkState {
        get { lock.withLock { _state } }
        set { lock.withLock { _state = newValue }; stateContinuation.yield(newValue) }
    }
    let lines: AsyncStream<String>
    let states: AsyncStream<LinkState>

    private let lock = NSLock()
    private var _state: LinkState = .idle
    private let lineContinuation: AsyncStream<String>.Continuation
    private let stateContinuation: AsyncStream<LinkState>.Continuation
    private let engine: Engine

    /// `heading` y `targetBearing` se leen en el instante de cada TX simulado.
    init(config: Config = Config(),
         heading: @escaping @Sendable () -> Double? = { nil },
         targetBearing: @escaping @Sendable () -> Double? = { nil }) {
        (lines, lineContinuation) = AsyncStream.makeStream(of: String.self)
        (states, stateContinuation) = AsyncStream.makeStream(of: LinkState.self)
        let cont = lineContinuation
        engine = Engine(config: config, heading: heading, target: targetBearing, emit: { cont.yield($0) })
    }

    func open() async throws {
        guard state != .ready else { return }
        state = .connecting
        try? await Task.sleep(for: .milliseconds(300))
        state = .ready
    }

    func close() {
        state = .idle
        Task { await engine.cancel() }
        lineContinuation.finish()
        stateContinuation.finish()
    }

    func send(_ line: String) async throws {
        guard state == .ready else { throw LinkError.connectionLost }
        await engine.handle(line)
    }

    /// Para probar la reconexión: el enlace se cae pero el pinger conserva su configuración.
    func simulateDisconnect() { state = .failed(.connectionLost) }

    // MARK: - Pinger virtual

    private actor Engine {
        let config: Config
        let heading: @Sendable () -> Double?
        let target: @Sendable () -> Double?
        let emit: @Sendable (String) -> Void

        private var rng: SplitMix64
        private var hash: String?
        private var rateMs = 1500
        private var pending = false
        private var seq: UInt32 = 0
        private var txLog: [(start: Double, dur: Double)] = []   // ms, ya escalados
        private var task: Task<Void, Never>?

        init(config: Config, heading: @escaping @Sendable () -> Double?, target: @escaping @Sendable () -> Double?,
             emit: @escaping @Sendable (String) -> Void) {
            self.config = config; self.heading = heading; self.target = target; self.emit = emit
            rng = SplitMix64(seed: config.seed)
        }

        func cancel() { task?.cancel() }

        func handle(_ raw: String) {
            let parts = raw.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ", maxSplits: 1).map(String.init)
            guard let word = parts.first?.uppercased() else { return }
            let arg = parts.count > 1 ? parts[1] : ""
            switch word {
            case "HELLO": emit("#HELLO fw=sim proto=1 radio=SX1262 id=51AA01")
            case "CFG?": emit("#CFG freq=915.800 bw=250 sf=10 cr=5 txp=22 hash=\(hash ?? "") rate=\(rateMs) timeout=auto raw=0")
            case "STOP": emit("#OK stop")
            case "MON": emit("#OK mon=\(arg.lowercased())")
            case "SET": set(arg)
            case "PING": ping()
            default: emit("!ERR unknown")
            }
        }

        private func set(_ arg: String) {
            let kv = arg.split(separator: "=", maxSplits: 1).map(String.init)
            guard kv.count == 2 else { return emit("!ERR syntax") }
            switch kv[0].lowercased() {
            case "hash":
                guard let h = Repeater.normalizedHashPrefix(kv[1]) else { return emit("!ERR range hash 00-FF") }
                hash = h
                emit("#OK hash=\(kv[1])")
            case "rate":
                guard let r = Int(kv[1]), r >= 1000 else { return emit("!ERR range rate>=1000") }
                rateMs = r
                emit("#OK rate=\(r)")
            case "freq", "bw", "sf", "cr", "txp", "timeout", "raw":
                emit("#OK \(kv[0])=\(kv[1])")
            default:
                emit("!ERR unknown \(kv[0])")
            }
        }

        private func ping() {
            guard hash != nil else { return emit("!ERR state nohash") }
            guard !pending else { return emit("!ERR state busy") }
            pending = true
            task = Task { await runPing() }
        }

        private func runPing() async {
            defer { pending = false }
            let toa = 177 * config.delayScale, window = 60_000 * config.delayScale, budget = 6_000 * config.delayScale

            // Límite de TX: el 10 % de 60 s. Si no cabe, el TX se retrasa y se avisa.
            while true {
                let now = nowMs()
                txLog.removeAll { now - $0.start >= window }
                let used = txLog.reduce(0) { $0 + $1.dur }
                if used + toa <= budget { break }
                let wait = max((txLog.first?.start ?? now) + window - now, 1)
                emit("#WARN duty_wait \(Int(wait / config.delayScale))")
                try? await Task.sleep(for: .milliseconds(wait))
                if Task.isCancelled { return }
            }
            txLog.append((nowMs(), toa))

            let delta: Double = {
                guard let h = heading(), let t = target() else { return 0 }
                return Geo.signedDelta(target: t, current: h)
            }()
            try? await Task.sleep(for: .milliseconds((toa + 1207 * config.delayScale)))   // el pinger espera toda su ventana
            if Task.isCancelled { return }

            seq += 1
            let tag = String(format: "%08X", UInt32(truncatingIfNeeded: rng.next()))
            if rng.uniform() < config.lossProbability {
                emit("P,\(seq),\(tag),timeout,,,,,0")
                return
            }
            let up = quantised(config.snr0 + Self.yagiGain(deltaDeg: delta, n: config.n, fbDB: config.frontToBackDB) + rng.gaussian() * config.noiseSigma)
            let dn = quantised(up - 1.0 + rng.gaussian() * config.noiseSigma)
            let rssi = (-108 + dn).rounded() + (rng.uniform() < 0.5 ? 0 : 0.5)
            let rtt = Int(220 + rng.uniform() * 230)
            emit("P,\(seq),\(tag),ok,\(rtt),\(String(format: "%+.2f,%+.2f,%+.1f", up, dn, rssi)),1")
        }

        private func quantised(_ x: Double) -> Double { (x * 4).rounded(.towardZero) / 4 }
        private func nowMs() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000 }

        /// Ganancia relativa (dB, ≤ 0) del patrón de Yagi para un ángulo fuera de eje.
        static func yagiGain(deltaDeg: Double, n: Double, fbDB: Double) -> Double {
            let c = max(cos(deltaDeg.rad / 2), 0)
            return 10 * log10(max(pow(c, 2 * n), pow(10, -fbDB / 10)))
        }
    }

    /// Ganancia del patrón, expuesta para la UI de depuración y las pruebas.
    static func yagiGain(deltaDeg: Double, n: Double = 8, fbDB: Double = 12) -> Double {
        Engine.yagiGain(deltaDeg: deltaDeg, n: n, fbDB: fbDB)
    }
}

/// Rumbo del teléfono y azimut al repetidor, compartidos de forma segura con el pinger simulado
/// (que los lee desde otro hilo). La interfaz los actualiza cuando cambian.
final class SimInputs: @unchecked Sendable {
    private let lock = NSLock()
    private var _heading: Double?, _target: Double?
    var heading: Double? { get { lock.withLock { _heading } } set { lock.withLock { _heading = newValue } } }
    var target: Double? { get { lock.withLock { _target } } set { lock.withLock { _target = newValue } } }
}

/// Generador pseudoaleatorio reproducible (SplitMix64).
struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Uniforme en [0, 1).
    mutating func uniform() -> Double { Double(next() >> 11) / Double(1 << 53) }

    /// Normal estándar (Box-Muller).
    mutating func gaussian() -> Double {
        let u1 = max(uniform(), 1e-12), u2 = uniform()
        return (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
    }
}
