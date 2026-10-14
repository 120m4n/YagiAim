import Foundation

/// Estado del enlace con el pinger.
enum LinkState: Equatable {
    case idle
    case scanning
    case connecting
    case ready
    case failed(LinkError)

    var isReady: Bool { self == .ready }

    var failure: LinkError? {
        if case .failed(let e) = self { return e }
        return nil
    }
}

/// Por qué falló el enlace. `message` es el texto que ve el usuario.
enum LinkError: Error, Equatable {
    case bluetoothOff
    case unauthorized
    case deviceNotFound
    case connectionLost
    case incompatibleFirmware(proto: Int)
    case timeout
    case writeFailed

    var message: String {
        switch self {
        case .bluetoothOff: "Bluetooth apagado. Actívalo en Ajustes."
        case .unauthorized: "MeshAzimuth no tiene permiso de Bluetooth. Actívalo en Ajustes."
        case .deviceNotFound: "No se encontró el pinger."
        case .connectionLost: "Conexión con el pinger perdida."
        case .incompatibleFirmware(let proto): "Firmware incompatible (proto=\(proto))"
        case .timeout: "El pinger no responde."
        case .writeFailed: "No se pudo enviar el comando al pinger."
        }
    }

    /// La pantalla debe ofrecer un botón a Ajustes (nunca un spinner infinito).
    var opensSettings: Bool { self == .bluetoothOff || self == .unauthorized }
}

/// Pinger descubierto. La identidad es el identificador del periférico (se recuerda el último usado).
struct PingerDevice: Identifiable, Equatable {
    let id: UUID
    var name: String        // "YagiPinger-1A2B"
    var fw: String?         // tras #HELLO
    var proto: Int?
}

/// Canal de líneas `proto=1` con el pinger: BLE NUS en campo, `SimulatedPinger` en tests y demos.
///
/// Contrato para las implementaciones:
/// - `lines` entrega líneas completas, sin `\n` (reensambladas con `LineAssembler`).
/// - `send` añade el `\n` y fragmenta según el MTU; lanza `LinkError` si el enlace no está `.ready`.
/// - `states` publica cada transición de `state` en orden y termina en `close()`; así quien lo usa
///   (PingerLink) reacciona a la pérdida de conexión sin sondear.
protocol LineTransport: AnyObject {
    var state: LinkState { get }
    var states: AsyncStream<LinkState> { get }
    var lines: AsyncStream<String> { get }

    /// Conecta hasta `.ready` o lanza el `LinkError` correspondiente.
    func open() async throws
    func close()
    func send(_ line: String) async throws
}
