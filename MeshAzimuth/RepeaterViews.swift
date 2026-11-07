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
    @State private var importAlert: (title: String, message: String)?
    @State private var showURLPrompt = false
    @State private var urlText = ""
    @State private var downloading = false

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
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { withAnimation { store.delete(r) } } label: { Label("Borrar", systemImage: "trash") }
                    }
                    .swipeActions(edge: .leading) {
                        Button { editing = r } label: { Label("Editar", systemImage: "pencil") }.tint(Theme.accent)
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
                        Button { showURLPrompt = true } label: { Label("Importar desde URL…", systemImage: "globe.americas") }
                        if let exportURL, !store.repeaters.isEmpty {
                            ShareLink(item: exportURL) { Label("Exportar JSON", systemImage: "square.and.arrow.up") }
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
            .sheet(item: $editing) { r in
                RepeaterEditor(repeater: r, isNew: !store.repeaters.contains { $0.id == r.id })
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { importFile($0) }
            .alert("Importar desde URL", isPresented: $showURLPrompt) {
                TextField("https://…/repetidores.json", text: $urlText)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Cancelar", role: .cancel) {}
                Button("Importar") { Task { await importURL() } }
                    .disabled(!urlText.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("https://"))
            } message: { Text("Dirección https de un JSON de repetidores.") }
            .alert(importAlert?.title ?? "", isPresented: Binding(get: { importAlert != nil }, set: { if !$0 { importAlert = nil } })) {
                Button("OK") {}
            } message: { Text(importAlert?.message ?? "") }
            .overlay {
                if downloading {
                    ProgressView("Descargando…").padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .onChange(of: store.repeaters, initial: true) { writeExport() }
        }
    }

    private func writeExport() {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("MeshAzimuth-repetidores.json")
        if let data = try? enc.encode(store.repeaters), (try? data.write(to: url)) != nil { exportURL = url }
    }

    /// Valida, fusiona y avisa: el motivo del error, o el resumen de la importación.
    private func importData(_ data: Data) {
        do {
            let list = try RepeaterStore.parse(data)
            let r = store.merge(list)
            importAlert = (r.added > 0 ? "Importación exitosa" : "Nada que importar",
                           "Importados \(r.added) de \(list.count)." + (r.skipped > 0 ? " Omitidos \(r.skipped) (duplicados o inválidos)." : ""))
        } catch {
            importAlert = ("Error al importar", error.localizedDescription)
        }
    }

    private func importFile(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            importData(try Data(contentsOf: url))
        } catch {
            importAlert = ("Error al importar", "No se pudo abrir el archivo (\(error.localizedDescription)).")
        }
    }

    private func importURL() async {
        guard let url = URL(string: urlText.trimmingCharacters(in: .whitespaces)) else {
            importAlert = ("Error al importar", "La URL no es válida.")
            return
        }
        downloading = true
        defer { downloading = false }
        do {
            let (data, response) = try await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 15))
            if let h = response as? HTTPURLResponse, !(200..<300).contains(h.statusCode) { throw ImportError("HTTP \(h.statusCode)") }
            importData(data)
        } catch {
            importAlert = ("Error al importar", "No se pudo descargar el archivo (\(error.localizedDescription)).")
        }
    }
}

struct RepeaterEditor: View {
    @Environment(RepeaterStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var repeater: Repeater
    let isNew: Bool
    @State private var altitudeText = ""
    @State private var latText = ""
    @State private var lonText = ""
    @State private var hashText = ""

    private var hashValid: Bool { hashText.isEmpty || Repeater.normalizedHashPrefix(hashText) != nil }

    private static func parse(_ t: String) -> Double? { Double(t.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) }
    private var lat: Double? { Self.parse(latText).flatMap { abs($0) <= 90 ? $0 : nil } }
    private var lon: Double? { Self.parse(lonText).flatMap { abs($0) <= 180 ? $0 : nil } }

    var body: some View {
        NavigationStack {
            Form {
                Section("Nombre") { TextField("Nombre", text: $repeater.name) }
                Section("Coordenadas (WGS84)") {
                    TextField("Latitud", text: $latText).keyboardType(.numbersAndPunctuation)
                    TextField("Longitud", text: $lonText).keyboardType(.numbersAndPunctuation)
                }
                Section {
                    TextField("Altitud antena (m s.n.m.)", text: $altitudeText)
                        .keyboardType(.decimalPad)
                } header: { Text("Opcional") } footer: {
                    Text("Si la indicas, se calcula el ángulo de elevación con corrección de curvatura (k = 4/3).")
                }
                Section {
                    TextField("Prefijo hash (2 hex)", text: $hashText)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    if !hashValid { Text("Deben ser exactamente 2 dígitos hexadecimales (0-9, A-F).").foregroundStyle(.red).font(.footnote) }
                } header: { Text("Pinger LoRa (opcional)") } footer: {
                    Text("Primer byte de la clave pública del repetidor (los dos primeros dígitos en la app MeshCore). El pinger lo usa para medir el enlace.")
                }
            }
            .navigationTitle(isNew ? "Nuevo repetidor" : "Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        repeater.altitude = Double(altitudeText.replacingOccurrences(of: ",", with: "."))
                        repeater.hashPrefix = Repeater.normalizedHashPrefix(hashText)
                        repeater.latitude = lat ?? repeater.latitude
                        repeater.longitude = lon ?? repeater.longitude
                        // Se decide contra el store: si el id ya existe es edición, nunca un duplicado.
                        store.repeaters.contains { $0.id == repeater.id } ? store.update(repeater) : store.add(repeater)
                        dismiss()
                    }
                    .disabled(repeater.name.isEmpty || lat == nil || lon == nil || !hashValid)
                }
            }
            .onAppear {
                altitudeText = repeater.altitude.map { String($0) } ?? ""
                latText = String(repeater.latitude)
                lonText = String(repeater.longitude)
                hashText = repeater.hashPrefix ?? ""
            }
        }
    }
}
