import CoreLocation
import SwiftUI

// MARK: - Lista y edición de sitios de baliza

struct BeaconSiteList: View {
    @Environment(BeaconStore.self) private var store
    @Environment(LocationManager.self) private var loc
    @Environment(\.dismiss) private var dismiss
    @State private var editing: BeaconSite?

    private var rows: [BeaconSite] {
        guard let me = loc.location?.coordinate else { return store.sites.sorted { $0.name < $1.name } }
        return store.sites.sorted { Geo.distance(from: me, to: $0.coordinate) < Geo.distance(from: me, to: $1.coordinate) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(rows) { s in
                    Button {
                        store.selectedID = s.id
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(s.name).font(.headline)
                                Text(BeaconSiteRow.detail(s, me: loc.location?.coordinate))
                                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if s.id == store.selectedID { Image(systemName: "checkmark").foregroundStyle(Theme.target) }
                        }
                    }
                    .tint(.primary)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { withAnimation { store.delete(s) } } label: { Label("Borrar", systemImage: "trash") }
                    }
                    .swipeActions(edge: .leading) {
                        Button { editing = s } label: { Label("Editar", systemImage: "pencil") }.tint(Theme.accent)
                    }
                }
            }
            .overlay {
                if store.sites.isEmpty {
                    ContentUnavailableView("Sin sitios de baliza", systemImage: "dot.radiowaves.left.and.right",
                                           description: Text("Toca el mapa donde está la baliza para agregar su marcador."))
                }
            }
            .navigationTitle("Sitios de baliza")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cerrar") { dismiss() } }
                ToolbarItem(placement: .topBarLeading) {
                    Button { editing = BeaconSite(name: "Nueva baliza", latitude: 0, longitude: 0) } label: { Image(systemName: "plus") }
                }
            }
            .sheet(item: $editing) { s in BeaconSiteEditor(site: s, isNew: !store.sites.contains { $0.id == s.id }) }
        }
    }
}

enum BeaconSiteRow {
    /// «1.2 km · az 62.8° ENE · 914.000 MHz», o las coordenadas si aún no hay ubicación.
    static func detail(_ s: BeaconSite, me: CLLocationCoordinate2D?) -> String {
        guard let me else { return String(format: "%.6f, %.6f · %@ MHz", s.latitude, s.longitude, s.freq) }
        let d = Geo.distance(from: me, to: s.coordinate), b = Geo.bearing(from: me, to: s.coordinate)
        let dist = d >= 1000 ? String(format: "%.1f km", d / 1000) : String(format: "%.0f m", d)
        return String(format: "%@ · az %.1f° %@ · %@ MHz", dist, b, Geo.cardinal(b), s.freq)
    }
}

struct BeaconSiteEditor: View {
    @Environment(BeaconStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var site: BeaconSite
    let isNew: Bool
    @State private var latText = ""
    @State private var lonText = ""
    @State private var altitudeText = ""
    @State private var freqText = ""
    @State private var freqUnlocked = false
    @FocusState private var freqFocused: Bool

    private static func parse(_ t: String) -> Double? { Double(t.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) }
    private var lat: Double? { Self.parse(latText).flatMap { abs($0) <= 90 ? $0 : nil } }
    private var lon: Double? { Self.parse(lonText).flatMap { abs($0) <= 180 ? $0 : nil } }
    private var freq: String? { BeaconSite.normalizedFreq(freqText) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Nombre") { TextField("Nombre", text: $site.name) }
                Section {
                    TextField("Latitud", text: $latText).keyboardType(.numbersAndPunctuation)
                    TextField("Longitud", text: $lonText).keyboardType(.numbersAndPunctuation)
                } header: { Text("Marcador (WGS84)") } footer: {
                    Text("Dónde está la baliza. El rumbo medido con el barrido se contrasta con el azimut a este punto.")
                }
                Section {
                    if freqUnlocked {
                        TextField("MHz", text: $freqText).keyboardType(.decimalPad).focused($freqFocused)
                        if freq == nil { Text("Entre 902 y 928 MHz y a 1 MHz o más de 915.800 (MeshCore).").foregroundStyle(.red).font(.footnote) }
                    } else {
                        // Bloqueada por defecto: un cambio por error deja al pinger escuchando donde no hay baliza.
                        LabeledContent {
                            Text("\(freqText) MHz").monospacedDigit()
                        } label: {
                            Label("Bloqueada", systemImage: "lock.fill").foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2) { freqUnlocked = true; freqFocused = true }
                        .accessibilityAction(named: "Editar frecuencia") { freqUnlocked = true; freqFocused = true }
                    }
                } header: { Text("Frecuencia de la baliza") } footer: {
                    Text("Debe coincidir con la del firmware de la baliza (914.000 por defecto). Cambiarla aquí no reprograma la baliza: solo cambia lo que escucha el pinger."
                         + (freqUnlocked ? "" : " Toca dos veces para editarla."))
                }
                Section {
                    TextField("Altitud antena (m s.n.m.)", text: $altitudeText).keyboardType(.decimalPad)
                } header: { Text("Opcional") } footer: { Text("Para el ángulo de elevación.") }
            }
            .navigationTitle(isNew ? "Nueva baliza" : "Editar baliza")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        site.latitude = lat ?? site.latitude
                        site.longitude = lon ?? site.longitude
                        site.altitude = Self.parse(altitudeText)
                        site.freq = freq ?? site.freq
                        store.upsert(site)
                        dismiss()
                    }
                    .disabled(site.name.isEmpty || lat == nil || lon == nil || freq == nil)
                }
            }
            .onAppear {
                latText = String(site.latitude)
                lonText = String(site.longitude)
                altitudeText = site.altitude.map { String($0) } ?? ""
                freqText = site.freq
            }
        }
    }
}
