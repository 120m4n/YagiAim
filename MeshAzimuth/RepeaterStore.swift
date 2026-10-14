import CoreLocation
import Foundation
import Observation

struct Repeater: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var latitude: Double
    var longitude: Double
    /// Altitud de la antena del repetidor (m s.n.m.), opcional, para elevación.
    var altitude: Double?
    /// Primer byte de la clave pública del repetidor (2 hex), para el pinger. Opcional: los
    /// repetidores guardados antes de este campo se decodifican con `nil`.
    var hashPrefix: String?

    var coordinate: CLLocationCoordinate2D {
        .init(latitude: latitude, longitude: longitude)
    }

    /// "a1" → "A1". nil si no son exactamente 2 dígitos hexadecimales.
    static func normalizedHashPrefix(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespaces).uppercased()
        return t.count == 2 && t.allSatisfy({ $0.isASCII && $0.isHexDigit }) ? t : nil
    }
}

/// Repetidores guardados en UserDefaults como JSON.
@Observable
final class RepeaterStore {
    private let key = "repeaters.v1"
    private let selectedKey = "repeaters.selected"

    var repeaters: [Repeater] = [] { didSet { save() } }
    var selectedID: UUID? {
        didSet { UserDefaults.standard.set(selectedID?.uuidString, forKey: selectedKey) }
    }

    var selected: Repeater? { repeaters.first { $0.id == selectedID } }

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let list = try? JSONDecoder().decode([Repeater].self, from: data) {
            repeaters = list
        }
        if let s = UserDefaults.standard.string(forKey: selectedKey) {
            selectedID = UUID(uuidString: s)
        }
    }

    func add(_ r: Repeater) {
        repeaters.append(r)
        selectedID = r.id
    }

    func update(_ r: Repeater) {
        guard let i = repeaters.firstIndex(where: { $0.id == r.id }) else { return }
        repeaters[i] = r
    }

    func delete(_ r: Repeater) {
        repeaters.removeAll { $0.id == r.id }
        if selectedID == r.id { selectedID = repeaters.first?.id }
    }

    /// Fusiona una lista importada: omite inválidos y duplicados (mismo id, o mismo nombre y coordenadas).
    @discardableResult
    func merge(_ list: [Repeater]) -> (added: Int, skipped: Int) {
        var added = 0
        for r in list {
            let valid = !r.name.isEmpty && abs(r.latitude) <= 90 && abs(r.longitude) <= 180
            let dup = repeaters.contains {
                $0.id == r.id || ($0.name == r.name && $0.latitude == r.latitude && $0.longitude == r.longitude)
            }
            if valid && !dup { repeaters.append(r); added += 1 }
        }
        return (added, list.count - added)
    }

    private func save() {
        if let data = try? JSONEncoder().encode(repeaters) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
