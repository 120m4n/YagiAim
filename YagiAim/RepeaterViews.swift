import SwiftUI
import UniformTypeIdentifiers

// MARK: - Lista y edición de repetidores

struct RepeaterList: View {
    @Environment(RepeaterStore.self) private var store
    @Environment(LocationManager.self) private var loc
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Repeater?
    @State private var query = ""
    @AppStorage("list.sortByDistance") private var sortByDistance = true
    @State private var exportURL: URL?
    @State private var showImporter = false
    @State private var importMessage: String?

    private var rows: [Repeater] {
        var list = store.repeaters
        if !query.isEmpty { list = list.filter { $0.name.localizedCaseInsensitiveContains(query) } }
        if sortByDistance, let me = loc.location?.coordinate {
            return list.sorted { Geo.distance(from: me, to: $0.coordinate) < Geo.distance(from: me, to: $1.coordinate) }
        }
        return list.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// «306.7 km · az 62.8° ENE», o las coordenadas si aún no hay ubicación.
    private func detail(_ r: Repeater) -> String {
        guard let me = loc.location?.coordinate else {
            return String(format: "%.6f, %.6f", r.latitude, r.longitude)
        }
        let d = Geo.distance(from: me, to: r.coordinate)
        let b = Geo.bearing(from: me, to: r.coordinate)
        let dist = d >= 1000 ? String(format: "%.1f km", d / 1000) : String(format: "%.0f m", d)
        return String(format: "%@ · az %.1f° %@", dist, b, Geo.cardinal(b))
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(rows) { r in
                    Button {
                        store.selectedID = r.id
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(r.name).font(.headline)
                                Text(detail(r))
                                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if r.id == store.selectedID {
                                Image(systemName: "checkmark").foregroundStyle(Theme.target)
                            }
                        }
                    }
                    .tint(.primary)
                    .swipeActions {
                        Button(role: .destructive) { store.delete(r) } label: { Label("Borrar", systemImage: "trash") }
                        Button { editing = r } label: { Label("Editar", systemImage: "pencil") }
                    }
                }
            }
            .searchable(text: $query, prompt: "Buscar repetidor")
            .overlay {
                if store.repeaters.isEmpty {
                    ContentUnavailableView("Sin repetidores", systemImage: "antenna.radiowaves.left.and.right",
                                           description: Text("Toca el mapa para agregar uno o importa un archivo."))
                }
            }
            .navigationTitle("Repetidores")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cerrar") { dismiss() } }
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { editing = Repeater(name: "Nuevo", latitude: 0, longitude: 0) } label: {
                        Image(systemName: "plus")
                    }
                    Menu {
                        Picker("Orden", selection: $sortByDistance) {
                            Label("Por cercanía", systemImage: "location").tag(true)
                            Label("Por nombre", systemImage: "textformat").tag(false)
                        }
                        Divider()
                        Button { showImporter = true } label: { Label("Importar JSON…", systemImage: "square.and.arrow.down") }
                        if let exportURL, !store.repeaters.isEmpty {
                            ShareLink(item: exportURL) { Label("Exportar JSON", systemImage: "square.and.arrow.up") }
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
            .sheet(item: $editing) { r in
                RepeaterEditor(repeater: r, isNew: !store.repeaters.contains { $0.id == r.id })
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
                importMessage = importFile(result)
            }
            .alert("Importación", isPresented: Binding(get: { importMessage != nil }, set: { if !$0 { importMessage = nil } })) {
                Button("OK") {}
            } message: { Text(importMessage ?? "") }
            .onChange(of: store.repeaters, initial: true) { writeExport() }
        }
    }

    private func writeExport() {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("MeshAzimuth-repetidores.json")
        if let data = try? enc.encode(store.repeaters), (try? data.write(to: url)) != nil { exportURL = url }
    }

    private func importFile(_ result: Result<URL, Error>) -> String {
        guard case .success(let url) = result else { return "No se pudo abrir el archivo." }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([Repeater].self, from: data) else {
            return "El archivo no tiene el formato esperado (lista JSON de repetidores)."
        }
        let r = store.merge(list)
        return "Importados \(r.added). Omitidos \(r.skipped) (duplicados o inválidos)."
    }
}

struct RepeaterEditor: View {
    @Environment(RepeaterStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var repeater: Repeater
    let isNew: Bool
    @State private var altitudeText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Nombre") { TextField("Nombre", text: $repeater.name) }
                Section("Coordenadas (WGS84)") {
                    TextField("Latitud", value: $repeater.latitude, format: .number.precision(.fractionLength(6)))
                        .keyboardType(.numbersAndPunctuation)
                    TextField("Longitud", value: $repeater.longitude, format: .number.precision(.fractionLength(6)))
                        .keyboardType(.numbersAndPunctuation)
                }
                Section {
                    TextField("Altitud antena (m s.n.m.)", text: $altitudeText)
                        .keyboardType(.decimalPad)
                } header: { Text("Opcional") } footer: {
                    Text("Si la indicas, se calcula el ángulo de elevación con corrección de curvatura (k = 4/3).")
                }
            }
            .navigationTitle(isNew ? "Nuevo repetidor" : "Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        repeater.altitude = Double(altitudeText.replacingOccurrences(of: ",", with: "."))
                        isNew ? store.add(repeater) : store.update(repeater)
                        dismiss()
                    }
                    .disabled(repeater.name.isEmpty || abs(repeater.latitude) > 90 || abs(repeater.longitude) > 180)
                }
            }
            .onAppear { altitudeText = repeater.altitude.map { String($0) } ?? "" }
        }
    }
}
