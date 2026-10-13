import CoreLocation
import MapKit
import SwiftUI

struct ContentView: View {
    @Environment(LocationManager.self) private var loc
    @Environment(RepeaterStore.self) private var store

    @State private var net = NetworkMonitor()
    @State private var pendingCoordinate: CLLocationCoordinate2D?
    @State private var showList = false
    @State private var showAimer = false
    @State private var showAbout = false
    @AppStorage("map.satellite") private var mapStyleSatellite = false

    private static let cameraKey = "map.camera"

    /// Última región vista; nil = seguir al usuario.
    private static func savedRegion() -> MKCoordinateRegion? {
        guard let d = UserDefaults.standard.array(forKey: cameraKey) as? [Double], d.count == 4,
              abs(d[0]) <= 90, abs(d[1]) <= 180, d[2] > 0, d[3] > 0 else { return nil }
        return .init(center: .init(latitude: d[0], longitude: d[1]),
                     span: .init(latitudeDelta: d[2], longitudeDelta: d[3]))
    }

    var body: some View {
        NavigationStack {
            MapView(
                repeaters: store.repeaters,
                selectedID: store.selectedID,
                me: loc.location?.coordinate,
                satellite: mapStyleSatellite,
                initialRegion: Self.savedRegion(),
                onSelect: { store.selectedID = $0 },
                onTap: { pendingCoordinate = $0 },
                onRegionChange: { r in
                    UserDefaults.standard.set([r.center.latitude, r.center.longitude,
                                               r.span.latitudeDelta, r.span.longitudeDelta],
                                              forKey: Self.cameraKey)
                }
            )
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .bottomLeading) {
                if !mapStyleSatellite {
                    Text("© OpenStreetMap contributors")
                        .font(.caption2)
                        .padding(4)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 4))
                        .padding(6)
                }
            }
            .safeAreaInset(edge: .bottom) { bottomPanel }
            .overlay(alignment: .top) {
                if !net.isOnline {
                    Label("Sin conexión: el mapa puede no cargar", systemImage: "wifi.slash")
                        .font(.footnote)
                        .padding(8)
                        .background(.regularMaterial, in: Capsule())
                        .padding(.top, 8)
                }
            }
            .navigationTitle("YagiAim")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.navy, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { mapStyleSatellite.toggle() } label: {
                        Image(systemName: mapStyleSatellite ? "map" : "globe.americas")
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showAbout = true } label: { Image(systemName: "info.circle") }
                    Button { showList = true } label: { Image(systemName: "list.bullet") }
                }
            }
            .sheet(item: Binding(
                get: { pendingCoordinate.map(PendingPoint.init) },
                set: { pendingCoordinate = $0?.coordinate }
            )) { p in
                RepeaterEditor(repeater: Repeater(
                    name: "Repetidor \(store.repeaters.count + 1)",
                    latitude: p.coordinate.latitude,
                    longitude: p.coordinate.longitude
                ), isNew: true)
            }
            .sheet(isPresented: $showList) { RepeaterList() }
            .sheet(isPresented: $showAbout) { AboutView() }
            .fullScreenCover(isPresented: $showAimer) { AimView() }
        }
        .onAppear { loc.start() }
    }

    @ViewBuilder private var bottomPanel: some View {
        if let r = store.selected {
            let info = AimInfo(me: loc.location, repeater: r, heading: loc.heading)
            Button { showAimer = true } label: {
                HStack(spacing: 14) {
                    CompassView(heading: loc.heading, target: info?.bearing)
                        .frame(width: 84, height: 84)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.name).font(.headline)
                        if let info {
                            Text(String(format: "Azimut %.1f° %@", info.bearing, Geo.cardinal(info.bearing)))
                                .font(.title3.monospacedDigit().bold())
                            Text(info.distanceText + (loc.isCachedLocation ? " · ubicación anterior" : ""))
                                .font(.subheadline).foregroundStyle(Theme.accent)
                        } else {
                            Text("Esperando GPS…").foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.secondary)
                }
                .padding()
                .background(Theme.navy.opacity(0.94), in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.accent.opacity(0.5), lineWidth: 1))
                .environment(\.colorScheme, .dark)
            }
            .buttonStyle(.plain)
            .padding(.horizontal)
        } else {
            Text("Toca el mapa donde está el repetidor MeshCore")
                .font(.subheadline)
                .padding(12)
                .foregroundStyle(.white)
                .background(Theme.navy.opacity(0.94), in: Capsule())
                .overlay(Capsule().stroke(Theme.accent.opacity(0.5), lineWidth: 1))
                .padding(.bottom, 8)
        }
    }
}

private struct PendingPoint: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var id: String { "\(coordinate.latitude),\(coordinate.longitude)" }
}

/// Datos derivados de apuntamiento.
struct AimInfo {
    let bearing: Double
    let distance: Double
    let elevation: Double?
    let delta: Double?

    init?(me: CLLocation?, repeater: Repeater, heading: Double?) {
        guard let me else { return nil }
        let b = Geo.bearing(from: me.coordinate, to: repeater.coordinate)
        let d = Geo.distance(from: me.coordinate, to: repeater.coordinate)
        bearing = b
        distance = d
        if let alt = repeater.altitude, me.verticalAccuracy >= 0 {
            elevation = Geo.elevation(distance: d, ownAltitude: me.altitude, targetAltitude: alt)
        } else {
            elevation = nil
        }
        delta = heading.map { Geo.signedDelta(target: b, current: $0) }
    }

    var distanceText: String {
        distance >= 1000 ? String(format: "%.2f km", distance / 1000) : String(format: "%.0f m", distance)
    }
}

// MARK: - Pantalla de apuntamiento a pantalla completa

struct AimView: View {
    @Environment(LocationManager.self) private var loc
    @Environment(RepeaterStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("tolerance") private var tolerance = 3.0

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let r = store.selected {
                    let info = AimInfo(me: loc.location, repeater: r, heading: loc.heading)

                    CompassView(heading: loc.heading, target: info?.bearing, tolerance: tolerance)
                        .padding(.horizontal, 24)

                    if let info {
                        instruction(info)
                        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                            row("Azimut verdadero", String(format: "%.1f° %@", info.bearing, Geo.cardinal(info.bearing)))
                            row("Rumbo teléfono", loc.heading.map { String(format: "%.1f°", $0) } ?? "—")
                            row("Distancia", info.distanceText)
                            if let e = info.elevation { row("Elevación", String(format: "%+.1f°", e)) }
                            row("Precisión brújula", accuracyText)
                            row("Precisión GPS", loc.location.map { String(format: "±%.0f m", $0.horizontalAccuracy) } ?? "—")
                        }
                        .font(.body.monospacedDigit())
                    } else {
                        ProgressView("Obteniendo ubicación…")
                    }

                    if loc.usingMagneticFallback {
                        Label("Usando norte magnético (sin GPS). Declinación no corregida.", systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(Theme.target)
                    }

                    VStack(alignment: .leading) {
                        Text("Tolerancia de alineación: ±\(Int(tolerance))°").font(.footnote)
                        Slider(value: $tolerance, in: 1...15, step: 1)
                    }
                    .padding(.horizontal)

                    Text("Sostén el teléfono plano sobre el boom, con la parte superior hacia el director. Aléjate de metal y del cable coaxial.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Spacer(minLength: 0)
            }
            .padding(.top)
            .navigationTitle(store.selected?.name ?? "Apuntar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } }
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var accuracyText: String {
        loc.headingAccuracy < 0 ? "sin calibrar" : String(format: "±%.0f°", loc.headingAccuracy)
    }

    @ViewBuilder private func instruction(_ info: AimInfo) -> some View {
        if let d = info.delta {
            if abs(d) <= tolerance {
                Label("Alineado", systemImage: "checkmark.circle.fill")
                    .font(.largeTitle.bold()).foregroundStyle(.green)
            } else {
                Label(String(format: "Gira %.0f°", abs(d)),
                      systemImage: d > 0 ? "arrow.clockwise" : "arrow.counterclockwise")
                    .font(.largeTitle.bold().monospacedDigit())
                    .foregroundStyle(Theme.target)
                    .contentTransition(.numericText())
            }
        } else {
            Text("Brújula no disponible").font(.title2).foregroundStyle(.secondary)
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        GridRow {
            Text(k).foregroundStyle(.secondary)
            Text(v).bold()
        }
    }
}

// MARK: - Lista y edición de repetidores

struct RepeaterList: View {
    @Environment(RepeaterStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Repeater?

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.repeaters) { r in
                    Button {
                        store.selectedID = r.id
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(r.name).font(.headline)
                                Text(String(format: "%.6f, %.6f", r.latitude, r.longitude))
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
            .overlay {
                if store.repeaters.isEmpty {
                    ContentUnavailableView("Sin repetidores", systemImage: "antenna.radiowaves.left.and.right",
                                           description: Text("Toca el mapa para agregar uno."))
                }
            }
            .navigationTitle("Repetidores")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cerrar") { dismiss() } }
                ToolbarItem(placement: .topBarLeading) {
                    Button { editing = Repeater(name: "Nuevo", latitude: 0, longitude: 0) } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: $editing) { r in
                RepeaterEditor(repeater: r, isNew: !store.repeaters.contains { $0.id == r.id })
            }
        }
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
