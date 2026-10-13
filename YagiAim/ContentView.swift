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
    @AppStorage("onboarding.done") private var onboardingDone = false
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
                VStack(spacing: 8) {
                    LocationDeniedBanner()
                    if !net.isOnline {
                        Label("Sin conexión: el mapa puede no cargar", systemImage: "wifi.slash")
                            .font(.footnote)
                            .padding(8)
                            .background(.regularMaterial, in: Capsule())
                    }
                }
                .padding(.top, 8)
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
            .fullScreenCover(isPresented: Binding(get: { !onboardingDone }, set: { if !$0 { onboardingDone = true } })) {
                OnboardingView()
            }
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
