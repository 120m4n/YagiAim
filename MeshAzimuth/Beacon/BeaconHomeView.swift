import CoreLocation
import MapKit
import SwiftUI

/// Entrada del modo baliza (spec 005): mapa con los sitios de baliza, alta tocando el mapa y acceso al barrido.
/// Tiene su propio almacén y su propio enlace (`PingerLink(kind: .pingPong)`): nada se comparte con TRACE.
struct BeaconHomeView: View {
    @Environment(LocationManager.self) private var loc
    @Environment(\.dismiss) private var dismiss
    @AppStorage("map.satellite") private var satellite = false
    @State private var store = BeaconStore()
    @State private var link: PingerLink
    @State private var tracking: MKUserTrackingMode = .follow
    @State private var pending: PendingSite?
    @State private var showList = false
    @State private var sweeping: BeaconSite?

    init() {
        let inputs = SimInputs()
        _link = State(initialValue: PingerLink(kind: .pingPong, simInputs: inputs) { device -> LineTransport in
            if UserDefaults.standard.bool(forKey: "pinger.simulated") {
                var c = SimulatedPinger.Config()
                c.beacon = .init()
                return SimulatedPinger(config: c, heading: { inputs.heading }, targetBearing: { inputs.target })
            }
            return BLELineTransport(deviceID: device?.id ?? BLELineTransport.lastDeviceID(for: .pingPong), kind: .pingPong)
        })
    }

    var body: some View {
        NavigationStack {
            MapView(repeaters: store.sites.map(\.marker), selectedID: store.selectedID, me: loc.location?.coordinate,
                    satellite: satellite, initialRegion: nil, tracking: $tracking,
                    onSelect: { store.selectedID = $0 }, onTap: { pending = PendingSite(coordinate: $0) }, onRegionChange: { _ in })
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .topTrailing) { TrackingButton(mode: $tracking).padding(.top, 8).padding(.trailing, 12) }
                .safeAreaInset(edge: .bottom) { panel }
                .navigationTitle("Orientar con baliza")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(Theme.navy, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarColorScheme(.dark, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { Button("Salir") { dismiss() } }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showList = true } label: { Image(systemName: "list.bullet") }
                    }
                }
                .sheet(item: $pending) { p in
                    BeaconSiteEditor(site: BeaconSite(name: "Baliza \(store.sites.count + 1)",
                                                      latitude: p.coordinate.latitude, longitude: p.coordinate.longitude),
                                     isNew: true)
                }
                .sheet(isPresented: $showList) { BeaconSiteList() }
                .navigationDestination(item: $sweeping) { BeaconSweepView(site: $0, link: link) }
        }
        .environment(store)
        .onDisappear { link.disconnect() }
    }

    @ViewBuilder private var panel: some View {
        if let s = store.selected {
            let info = AimInfo(me: loc.location, repeater: s.marker, heading: loc.heading)
            HStack(spacing: 14) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.title).foregroundStyle(Theme.target)
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name).font(.headline)
                    if let info {
                        Text(String(format: "Marcador a %.1f° %@", info.bearing, Geo.cardinal(info.bearing)))
                            .font(.title3.monospacedDigit().bold())
                        Text("\(info.distanceText) · \(s.freq) MHz").font(.subheadline).foregroundStyle(Theme.accent)
                    } else {
                        Text("Esperando GPS…").foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button { sweeping = s } label: { Label("Barrer", systemImage: "scope") }
                    .buttonStyle(.borderedProminent)
            }
            .padding()
            .background(Theme.navy.opacity(0.94), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.accent.opacity(0.5), lineWidth: 1))
            .environment(\.colorScheme, .dark)
            .padding(.horizontal)
        } else {
            Text("Toca el mapa donde está la baliza")
                .font(.subheadline).padding(12).foregroundStyle(.white)
                .background(Theme.navy.opacity(0.94), in: Capsule())
                .overlay(Capsule().stroke(Theme.accent.opacity(0.5), lineWidth: 1))
                .padding(.bottom, 8)
        }
    }
}

private struct PendingSite: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var id: String { "\(coordinate.latitude),\(coordinate.longitude)" }
}
