import Foundation
import Observation

/// Resultado de un `PING` con los instantes que necesita el registro de sesión.
struct PingReport: Equatable {
    var result: PingResult
    var tTx: Date            // justo después de escribir el comando (fija `heading_tx`)
    var tRx: Date            // al recibir el `P,` (fija `heading_rx`)
    var dutyWait: Bool       // llegó `#WARN duty_wait` entre el `PING` y su `P,`: el TX se retrasó
}

/// El pinger rechazó el comando (`!ERR <code> [detalle]`) o ya hay otra petición en curso.
enum PingerError: Error, Equatable {
    case rejected(code: String, detail: String?)
    case requestInFlight
}

/// Buffer circular de capacidad fija (los últimos N elementos).
struct RingBuffer<Element> {
    let capacity: Int
    private(set) var elements: [Element] = []
    init(capacity: Int) { self.capacity = capacity }
    mutating func append(_ e: Element) {
        elements.append(e)
        if elements.count > capacity { elements.removeFirst(elements.count - capacity) }
    }
    mutating func removeAll() { elements.removeAll() }
}

/// Enlace con el pinger: handshake, configuración, `PING` individuales, modo "En vivo" y reconexión.
///
/// La app **nunca** usa `GO`: envía un `PING` por muestra, espera su `P,` y solo entonces el siguiente.
/// Así conoce el instante de cada TX (para `heading_tx`) y respeta el límite de TX del pinger
/// (intervalo en vivo por defecto 2000 ms; research R-10).
@MainActor @Observable
final class PingerLink {
    private(set) var state: LinkState = .idle
    private(set) var device: PingerDevice?
    private(set) var config: [String: String] = [:]          // último #CFG
    private(set) var last: PingResult?
    private(set) var history = RingBuffer<PingResult>(capacity: 30)
    private(set) var live = false
    private(set) var lastWarning: String?
    private(set) var hash: String?

    /// Intervalo mínimo entre inicios de `PING` en "En vivo".
    static let minLiveInterval: Duration = .milliseconds(2000)
    /// Sin respuesta del pinger tras este tiempo, `ping()` falla (el pinger tarda ≈ 1.4 s con el preset por defecto).
    static let requestTimeout: Duration = .seconds(6)

    @ObservationIgnored private let makeTransport: (PingerDevice?) -> LineTransport
    @ObservationIgnored private var transport: LineTransport?
    @ObservationIgnored private var readerTask: Task<Void, Never>?
    @ObservationIgnored private var statesTask: Task<Void, Never>?
    @ObservationIgnored private var liveTask: Task<Void, Never>?
    @ObservationIgnored private var reconnectTask: Task<Void, Never>?
    @ObservationIgnored private var waiter: Waiter?
    @ObservationIgnored private var wantConnected = false
    @ObservationIgnored private var handshakeDone = false
    @ObservationIgnored private var resumeLiveAfterReconnect = false

    /// Rumbo y azimut que lee el pinger simulado (la interfaz los actualiza).
    @ObservationIgnored let simInputs: SimInputs

    /// `.yagi`: TRACE con `proto=1` (spec 003). `.pingPong`: baliza con `proto=2` y `MEAS` (spec 005).
    /// La app tiene un enlace de cada tipo: no comparten estado ni datos.
    let kind: PingerDevice.Kind

    /// `makeTransport` recibe el dispositivo elegido (nil = el último usado / el primero que aparezca).
    init(kind: PingerDevice.Kind = .yagi, simInputs: SimInputs = SimInputs(),
         makeTransport: @escaping (PingerDevice?) -> LineTransport) {
        self.kind = kind
        self.simInputs = simInputs
        self.makeTransport = makeTransport
    }

    var isOperational: Bool { state.isReady && handshakeDone }

    // MARK: - Conexión

    /// Abre el enlace, valida el firmware y deja al pinger listo (`STOP`, `MON off`, `CFG?`, `SET hash`).
    func connect(device: PingerDevice? = nil, hash: String?) async {
        disconnect()
        wantConnected = true
        self.device = device
        self.hash = hash
        freq = nil
        let t = makeTransport(device)
        transport = t
        startReaders(t)
        do {
            try await t.open()
            try await handshake()
        } catch {
            fail(error)
        }
    }

    func disconnect() {
        wantConnected = false
        stopLive()
        stopMeter()
        reconnectTask?.cancel(); reconnectTask = nil
        readerTask?.cancel(); readerTask = nil
        statesTask?.cancel(); statesTask = nil
        waiter?.finish(.failure(LinkError.connectionLost)); waiter = nil
        transport?.close(); transport = nil
        handshakeDone = false
        state = .idle
    }

    /// Cambia el repetidor objetivo (válido en cualquier momento; el pinger lo aplica al siguiente ping).
    func configure(hash: String) async throws {
        guard let h = Repeater.normalizedHashPrefix(hash) else { throw PingerError.rejected(code: "range", detail: "hash 00-FF") }
        _ = try await request("SET hash=\(h)") { if case .ok(let t) = $0 { return t.lowercased().hasPrefix("hash=") } else { return false } }
        self.hash = h
    }

    private func handshake() async throws {
        let hello = try await request("HELLO") { if case .hello = $0 { return true } else { return false } }
        if case .hello(let fw, let proto, _, _) = hello.event {
            device?.fw = fw; device?.proto = proto
            switch kind {
            case .yagi:
                guard proto == 1 else { throw LinkError.incompatibleFirmware(proto: proto) }
            case .pingPong:
                // `role=pinger` no se comprueba: el escáner ya filtra por `PingPong-PI-` y `.hello` no lo trae.
                guard proto == 2 else { throw LinkError.incompatibleFirmware(proto: proto) }
                guard Self.firmware(fw, atLeast: Self.minBeaconFirmware) else {
                    throw LinkError.outdatedFirmware(fw: fw, minimum: Self.minBeaconFirmware)
                }
            }
        }
        _ = try await request("STOP") { if case .ok(let t) = $0 { return t == "stop" } else { return false } }
        _ = try await request("MON off") { if case .ok(let t) = $0 { return t == "mon=off" } else { return false } }
        _ = try await request("CFG?") { if case .cfg = $0 { return true } else { return false } }
        if let hash { try await configure(hash: hash) }
        if let freq { try await setFrequency(freq) }       // el pinger vuelve a 915.800 al reiniciar
        handshakeDone = true
        state = .ready
    }

    private func fail(_ error: Error) {
        let e = (error as? LinkError) ?? .connectionLost
        handshakeDone = false
        state = .failed(e)
        transport?.close(); transport = nil
        readerTask?.cancel(); statesTask?.cancel()
        wantConnected = false
    }

    // MARK: - Ping

    /// Envía un `PING` y espera su `P,`. Falla con `PingerError.rejected` si el pinger responde `!ERR`
    /// (p. ej. `state busy`) o con `LinkError.timeout` si no responde.
    /// `onSent` se llama justo después de escribir el comando: ahí hay que leer el rumbo (`heading_tx`).
    func ping(onSent: (@MainActor () -> Void)? = nil) async throws -> PingReport {
        guard kind == .yagi else { throw PingerError.rejected(code: "mode", detail: "baliza") }
        guard isOperational else { throw LinkError.connectionLost }
        let r = try await request("PING", onSent: onSent) { if case .ping = $0 { return true } else { return false } }
        guard case .ping(let result) = r.event else { throw LinkError.writeFailed }
        return PingReport(result: result, tTx: r.tTx, tRx: Date(), dutyWait: r.dutyWait)
    }

    func startLive() {
        guard kind == .yagi, isOperational, !live else { return }
        live = true
        liveTask = Task { [weak self] in await self?.runLive() }
    }

    func stopLive() {
        live = false
        liveTask?.cancel(); liveTask = nil
    }

    private func runLive() async {
        while live && !Task.isCancelled {
            let started = ContinuousClock.now
            do {
                _ = try await ping()
            } catch PingerError.rejected {
                // busy / duty: simplemente se espera al siguiente intervalo
            } catch PingerError.requestInFlight {
            } catch {
                live = false     // enlace caído o sin respuesta: la reconexión decide si se retoma
                return
            }
            let interval = max(Self.minLiveInterval, .milliseconds(Int(config["rate"] ?? "") ?? 0))
            try? await Task.sleep(until: started + interval, clock: .continuous)
        }
    }

    // MARK: - Baliza (proto=2, spec 005)

    static let minBeaconFirmware = "0.5.1"
    /// Lecturas por `MEAS` del medidor: ≈ 70 ms en el pinger (research R-3).
    static let meterSamples = 32

    private(set) var metering = false
    /// Última frecuencia aplicada con `setFrequency`; se reaplica tras reconectar.
    private(set) var freq: String?
    @ObservationIgnored private var meterTask: Task<Void, Never>?
    @ObservationIgnored private var meterHandler: (@MainActor (MeasResult) -> Void)?
    @ObservationIgnored private var resumeMeterAfterReconnect = false

    /// Comparación numérica de versiones ("0.10.0" ≥ "0.5.1").
    static func firmware(_ fw: String, atLeast min: String) -> Bool {
        fw.compare(min, options: .numeric) != .orderedAscending
    }

    /// `SET freq=<MHz>`. No transmite. Con el medidor en marcha falla con `requestInFlight`: pararlo antes.
    func setFrequency(_ mhz: String) async throws {
        _ = try await request("SET freq=\(mhz)") { if case .ok(let t) = $0 { return t.hasPrefix("freq=") } else { return false } }
        freq = mhz
    }

    /// Un `MEAS n` y su `M,`.
    func meas(n: Int = PingerLink.meterSamples) async throws -> MeasResult {
        guard kind == .pingPong else { throw PingerError.rejected(code: "mode", detail: "trace") }
        guard isOperational else { throw LinkError.connectionLost }
        let r = try await request("MEAS \(n)") { if case .meas = $0 { return true } else { return false } }
        guard case .meas(let m) = r.event else { throw LinkError.writeFailed }
        return m
    }

    /// Encadena `MEAS 32` sin pausa y entrega cada resultado al recibirlo (ahí se lee el rumbo, research R-4).
    /// Se detiene al perder el enlace y se retoma tras reconectar, como "En vivo".
    func startMeter(onReading: @escaping @MainActor (MeasResult) -> Void) {
        guard kind == .pingPong, isOperational, !metering else { return }
        metering = true
        meterHandler = onReading
        meterTask = Task { [weak self] in await self?.runMeter() }
    }

    func stopMeter() {
        metering = false
        meterTask?.cancel(); meterTask = nil
    }

    private func runMeter() async {
        while metering && !Task.isCancelled {
            do {
                let m = try await meas()
                if metering { meterHandler?(m) }
            } catch PingerError.rejected, PingerError.requestInFlight {
                // `state busy` u otra petición en curso: siguiente ciclo (la pausa evita girar en vacío)
                try? await Task.sleep(for: .milliseconds(100))
            } catch {
                metering = false     // enlace caído o sin respuesta: la reconexión decide si se retoma
                return
            }
        }
    }

    // MARK: - Peticiones y lectura de líneas

    private final class Waiter {
        let accept: (PingerEvent) -> Bool
        var dutyWait = false
        var tTx = Date()
        private var continuation: CheckedContinuation<PingerEvent, Error>?
        private var outcome: Result<PingerEvent, Error>?
        var timeout: Task<Void, Never>?

        init(accept: @escaping (PingerEvent) -> Bool) { self.accept = accept }

        func await() async throws -> PingerEvent {
            try await withCheckedThrowingContinuation { cont in
                if let outcome { cont.resume(with: outcome) } else { continuation = cont }
            }
        }

        /// Una sola resolución: el primer evento, error o timeout que llegue.
        func finish(_ result: Result<PingerEvent, Error>) {
            guard outcome == nil else { return }
            outcome = result
            timeout?.cancel()
            continuation?.resume(with: result)
            continuation = nil
        }
    }

    private func request(_ command: String, onSent: (@MainActor () -> Void)? = nil, accept: @escaping (PingerEvent) -> Bool)
        async throws -> (event: PingerEvent, tTx: Date, dutyWait: Bool) {
        guard waiter == nil else { throw PingerError.requestInFlight }
        guard let transport else { throw LinkError.connectionLost }
        let w = Waiter(accept: accept)
        waiter = w
        defer { if waiter === w { waiter = nil }; w.timeout?.cancel() }

        w.timeout = Task { [weak w] in
            try? await Task.sleep(for: Self.requestTimeout)
            w?.finish(.failure(LinkError.timeout))
        }
        try await transport.send(command)
        w.tTx = Date()
        onSent?()
        let event = try await w.await()
        return (event, w.tTx, w.dutyWait)
    }

    private func startReaders(_ t: LineTransport) {
        readerTask?.cancel(); statesTask?.cancel()
        readerTask = Task { [weak self] in
            for await line in t.lines { self?.handle(LineCodec.parse(line)) }
        }
        statesTask = Task { [weak self] in
            for await s in t.states { self?.transportStateChanged(s) }
        }
    }

    private func handle(_ event: PingerEvent) {
        switch event {
        case .cfg(let c): config = c
        case .warn(let code, let detail):
            lastWarning = detail.map { "\(code) \($0)" } ?? code
            if code == "duty_wait" { waiter?.dutyWait = true }
        case .ping(let r):
            last = r
            history.append(r)
        default: break
        }
        guard let w = waiter else { return }
        if case .error(let code, let detail) = event {
            w.finish(.failure(PingerError.rejected(code: code, detail: detail)))
        } else if w.accept(event) {
            w.finish(.success(event))
        }
    }

    // MARK: - Reconexión

    private func transportStateChanged(_ s: LinkState) {
        switch s {
        case .ready: if handshakeDone { state = .ready }
        case .failed(.connectionLost):
            handshakeDone = false
            resumeLiveAfterReconnect = live
            stopLive()
            resumeMeterAfterReconnect = metering
            stopMeter()
            waiter?.finish(.failure(LinkError.connectionLost))
            state = .failed(.connectionLost)
            if wantConnected { reconnect() }
        case .failed, .idle: break
        case .scanning, .connecting: if !handshakeDone { state = s }
        }
    }

    /// Reintenta en segundo plano con espera 1-2-4 s (tope 4 s) mientras alguien quiera el enlace.
    private func reconnect() {
        guard reconnectTask == nil, let t = transport else { return }
        reconnectTask = Task { [weak self] in
            var delay = 1.0
            while let self, self.wantConnected, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(delay))
                guard self.wantConnected, !Task.isCancelled else { break }
                do {
                    try await t.open()
                    try await self.handshake()
                    self.reconnectTask = nil
                    if self.resumeLiveAfterReconnect { self.startLive() }
                    if self.resumeMeterAfterReconnect, let h = self.meterHandler { self.startMeter(onReading: h) }
                    return
                } catch LinkError.incompatibleFirmware(let p) {
                    self.fail(LinkError.incompatibleFirmware(proto: p)); return
                } catch let e as LinkError where e.isOutdatedFirmware {
                    self.fail(e); return
                } catch {
                    delay = min(delay * 2, 4)
                }
            }
            self?.reconnectTask = nil
        }
    }
}
