import MapKit
import SwiftUI

/// Teselas OSM con caché pasiva en disco: solo se guarda lo que se ve.
/// Con red usa la política HTTP normal (revalida al expirar); sin red sirve
/// lo guardado aunque esté vencido. No hay prefetch (lo prohíbe la política OSM).
final class CachedTileOverlay: MKTileOverlay {
    private static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = URLCache(memoryCapacity: 20_000_000, diskCapacity: 500_000_000)
        c.httpAdditionalHeaders = ["User-Agent": "YagiAim/1.0 (co.electrosoftware.yagiaim)"]
        return URLSession(configuration: c)
    }()

    init() {
        super.init(urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
        canReplaceMapContent = true
        maximumZ = 19
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, Error?) -> Void) {
        let url = url(forTilePath: path)
        Task {
            do {
                result(try await Self.fetch(URLRequest(url: url)), nil)
            } catch {
                // Sin red: lo que haya en disco, aunque esté vencido.
                let stale = URLRequest(url: url, cachePolicy: .returnCacheDataDontLoad)
                do { result(try await Self.fetch(stale), nil) } catch { result(nil, error) }
            }
        }
    }

    private static func fetch(_ req: URLRequest) async throws -> Data {
        let (data, resp) = try await session.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return data
    }
}

/// Mapa UIKit: el `Map` de SwiftUI no admite overlays de teselas propias.
struct MapView: UIViewRepresentable {
    let repeaters: [Repeater]
    let selectedID: UUID?
    let me: CLLocationCoordinate2D?
    let satellite: Bool
    let initialRegion: MKCoordinateRegion?
    var onSelect: (UUID) -> Void
    var onTap: (CLLocationCoordinate2D) -> Void
    var onRegionChange: (MKCoordinateRegion) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.showsCompass = false
        if let initialRegion { map.setRegion(initialRegion, animated: false) }
        else { map.userTrackingMode = .follow }

        let doubleTap = UITapGestureRecognizer()
        doubleTap.numberOfTapsRequired = 2
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        tap.delegate = context.coordinator
        tap.require(toFail: doubleTap)
        map.addGestureRecognizer(doubleTap)
        map.addGestureRecognizer(tap)

        let track = MKUserTrackingButton(mapView: map)
        let compass = MKCompassButton(mapView: map)
        compass.compassVisibility = .adaptive
        let scale = MKScaleView(mapView: map)
        scale.scaleVisibility = .visible
        for v in [track, compass, scale] {
            v.translatesAutoresizingMaskIntoConstraints = false
            map.addSubview(v)
        }
        let g = map.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            track.topAnchor.constraint(equalTo: g.topAnchor, constant: 8),
            track.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -8),
            compass.topAnchor.constraint(equalTo: track.bottomAnchor, constant: 8),
            compass.centerXAnchor.constraint(equalTo: track.centerXAnchor),
            scale.topAnchor.constraint(equalTo: g.topAnchor, constant: 8),
            scale.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 8),
        ])
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        let c = context.coordinator
        c.parent = self

        // Base: satélite de Apple (requiere red) u OSM con caché.
        if satellite {
            map.mapType = .hybrid
            if let t = c.tiles { map.removeOverlay(t); c.tiles = nil }
        } else {
            map.mapType = .standard
            if c.tiles == nil {
                let t = CachedTileOverlay()
                c.tiles = t
                map.addOverlay(t, level: .aboveLabels)
            }
        }

        let sig = repeaters.map { "\($0.id)\($0.name)\($0.latitude)\($0.longitude)" } + ["\(String(describing: selectedID))"]
        if sig != c.annotationSig {
            c.annotationSig = sig
            map.removeAnnotations(map.annotations.filter { $0 is RepeaterAnnotation })
            map.addAnnotations(repeaters.map { RepeaterAnnotation($0, selected: $0.id == selectedID) })
        }

        let target = repeaters.first { $0.id == selectedID }?.coordinate
        let lineSig = [me?.latitude, me?.longitude, target?.latitude, target?.longitude]
        if lineSig != c.lineSig {
            c.lineSig = lineSig
            if let l = c.line { map.removeOverlay(l); c.line = nil }
            if let me, let target {
                let l = MKPolyline(coordinates: [me, target], count: 2)
                c.line = l
                map.addOverlay(l)
            }
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {
        var parent: MapView
        var tiles: CachedTileOverlay?
        var line: MKPolyline?
        var annotationSig: [String] = []
        var lineSig: [Double?] = []

        init(_ p: MapView) { parent = p }

        @objc func tapped(_ g: UITapGestureRecognizer) {
            guard let map = g.view as? MKMapView else { return }
            parent.onTap(map.convert(g.location(in: map), toCoordinateFrom: map))
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var v = touch.view
            while let cur = v {
                if cur is MKAnnotationView || cur is UIControl || cur is MKCompassButton || cur is MKScaleView { return false }
                v = cur.superview
            }
            return true
        }

        func mapView(_ map: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let t = overlay as? MKTileOverlay { return MKTileOverlayRenderer(tileOverlay: t) }
            let r = MKPolylineRenderer(overlay: overlay)
            r.strokeColor = .systemOrange
            r.lineWidth = 3
            r.lineDashPattern = [8, 6]
            return r
        }

        func mapView(_ map: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let a = annotation as? RepeaterAnnotation else { return nil }
            let v = MKMarkerAnnotationView(annotation: a, reuseIdentifier: "repeater")
            v.glyphImage = UIImage(systemName: "antenna.radiowaves.left.and.right")
            v.markerTintColor = a.isSelected ? .systemOrange : .systemGray
            return v
        }

        func mapView(_ map: MKMapView, didSelect view: MKAnnotationView) {
            if let a = view.annotation as? RepeaterAnnotation { parent.onSelect(a.id) }
            map.deselectAnnotation(view.annotation, animated: false)
        }

        func mapView(_ map: MKMapView, regionDidChangeAnimated animated: Bool) {
            parent.onRegionChange(map.region)
        }
    }
}

final class RepeaterAnnotation: NSObject, MKAnnotation {
    let id: UUID
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let isSelected: Bool

    init(_ r: Repeater, selected: Bool) {
        id = r.id
        coordinate = r.coordinate
        title = r.name
        isSelected = selected
    }
}
