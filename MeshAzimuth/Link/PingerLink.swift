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

    /// `makeTransport` recibe el dispositivo elegido (nil = el último usado / el primero que aparezca).
    init(simInputs: SimInputs = SimInputs(), makeTransport: @escaping (PingerDevice?) -> LineTransport) {
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
            guard proto == 1 else { throw LinkError.incompatibleFirmware(proto: proto) }
        }
        _ = try await request("STOP") { if case .ok(let t) = $0 { return t == "stop" } else { return false } }
        _ = try await request("MON off") { if case .ok(let t) = $0 { return t == "mon=off" } else { return false } }
        _ = try await request("CFG?") { if case .cfg = $0 { return true } else { return false } }
        if let hash { try await configure(hash: hash) }
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
        guard isOperational else { throw LinkError.connectionLost }
        let r = try await request("PING", onSent: onSent) { if case .ping = $0 { return true } else { return false } }
        guard case .ping(let result) = r.event else { throw LinkError.writeFailed }
        return PingReport(result: result, tTx: r.tTx, tRx: Date(), dutyWait: r.dutyWait)
    }

    func startLive() {
        guard isOperational, !live else { return }
        live = true
        liveTask = Task { [weak self] in await self?.runLive() }
    }

    func stopLive() {
        live = false
        liveTask?.cancel(); liveTask = nil
    }

    /// Como `stopLive()`, pero espera a que acabe el ping en vuelo (libera la petición única).
    func stopLiveAndWait() async {
        let t = liveTask
        stopLive()
        await t?.value
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
                    return
                } catch LinkError.incompatibleFirmware(let p) {
                    self.fail(LinkError.incompatibleFirmware(proto: p)); return
                } catch {
                    delay = min(delay * 2, 4)
                }
            }
            self?.reconnectTask = nil
        }
    }
}
