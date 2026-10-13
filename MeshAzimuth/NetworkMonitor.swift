import Network
import Observation

/// Estado de conectividad, para avisar cuando el mapa puede no cargar.
@Observable
final class NetworkMonitor {
    var isOnline = true
    @ObservationIgnored private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.isOnline = path.status == .satisfied }
        }
        monitor.start(queue: .global(qos: .utility))
    }
}
