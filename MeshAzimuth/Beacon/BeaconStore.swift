import CoreLocation
import Foundation
import Observation

/// Sitio donde está (o estará) la baliza: el marcador contra el que se contrasta el rumbo medido.
/// Datos propios del modo baliza: no se mezclan con los repetidores.
struct BeaconSite: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var latitude: Double
    var longitude: Double
    var altitude: Double?
    var freq: String = BeaconSite.defaultFreq      // MHz, "914.000"

    static let defaultFreq = "914.000"
    /// Canal MeshCore por defecto: la baliza y el piso deben quedar lejos de él.
    static let meshFreq = 915.8

    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }

    /// Para reutilizar el mapa y `AimInfo` (solo de lectura; no se guarda como repetidor).
    var marker: Repeater { Repeater(id: id, name: name, latitude: latitude, longitude: longitude, altitude: altitude) }

    /// FR-020: 902–928 MHz y a ≥ 1 MHz de 915.800. "914" o "914,0" → "914.000"; nil si no vale.
    static func normalizedFreq(_ text: String) -> String? {
        guard let f = Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")),
              (902...928).contains(f), abs(f - meshFreq) >= 1 else { return nil }
        return String(format: "%.3f", f)
    }

    /// Frecuencia donde se mide el piso (FR-021): 1 MHz por debajo; por encima si se sale de la banda
    /// o cae sobre el canal MeshCore (habría tráfico ajeno).
    static func floorFreq(for freq: String) -> String {
        let f = Double(freq) ?? 914
        let below = f - 1
        let use = below < 902 || abs(below - meshFreq) < 0.5 ? f + 1 : below
        return String(format: "%.3f", use)
    }
}

/// Sitios de baliza guardados en UserDefaults como JSON (como `RepeaterStore`, con su propia clave).
@Observable
final class BeaconStore {
    private let key = "beacons.v1"
    private let selectedKey = "beacons.selected"

    var sites: [BeaconSite] = [] { didSet { save() } }
    // Solo se escribe si cambia: cualquier escritura en UserDefaults redibuja las vistas con @AppStorage.
    var selectedID: UUID? {
        didSet {
            guard selectedID?.uuidString != UserDefaults.standard.string(forKey: selectedKey) else { return }
            UserDefaults.standard.set(selectedID?.uuidString, forKey: selectedKey)
        }
    }
    var selected: BeaconSite? { sites.first { $0.id == selectedID } }

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let list = try? JSONDecoder().decode([BeaconSite].self, from: data) {
            sites = list
        }
        selectedID = UserDefaults.standard.string(forKey: selectedKey).flatMap(UUID.init(uuidString:))
    }

    /// Alta o edición según exista el id.
    func upsert(_ s: BeaconSite) {
        if let i = sites.firstIndex(where: { $0.id == s.id }) { sites[i] = s } else { sites.append(s) }
        selectedID = s.id
    }

    func delete(_ s: BeaconSite) {
        sites.removeAll { $0.id == s.id }
        if selectedID == s.id { selectedID = sites.first?.id }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(sites), data != UserDefaults.standard.data(forKey: key) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
