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

    var coordinate: CLLocationCoordinate2D {
        .init(latitude: latitude, longitude: longitude)
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

    private func save() {
        if let data = try? JSONEncoder().encode(repeaters) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
