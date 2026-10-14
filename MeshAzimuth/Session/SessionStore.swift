import Foundation

/// Sesiones como JSON, una por archivo: `Application Support/Sessions/<uuid>.json` (pesan < 100 KB).
struct SessionStore {
    let directory: URL

    static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sessions")
    }

    init(directory: URL = SessionStore.defaultDirectory) { self.directory = directory }

    func save(_ session: Session) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        try enc.encode(session).write(to: url(session.id), options: .atomic)
    }

    func load(_ id: UUID) throws -> Session {
        try JSONDecoder().decode(Session.self, from: Data(contentsOf: url(id)))
    }

    /// Sesiones guardadas, más recientes primero; las corruptas se omiten. `repeaterID` filtra por repetidor.
    func sessions(forRepeater repeaterID: UUID? = nil) -> [Session] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }
            .compactMap { try? JSONDecoder().decode(Session.self, from: Data(contentsOf: $0)) }
            .filter { repeaterID == nil || $0.repeater.id == repeaterID }
            .sorted { $0.started > $1.started }
    }

    func delete(_ id: UUID) throws { try FileManager.default.removeItem(at: url(id)) }

    private func url(_ id: UUID) -> URL { directory.appendingPathComponent("\(id.uuidString).json") }
}
