import CoreLocation
import Observation
import UIKit

/// Publica posición y rumbo verdadero del dispositivo.
/// El rumbo se refiere al borde superior del teléfono: alinea el boom de la
/// Yagi con el eje largo del teléfono (parte superior hacia el director).
@Observable
final class LocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    var location: CLLocation?
    /// Rumbo verdadero suavizado (0–360). nil si no hay brújula o sin calibrar.
    var heading: Double?
    /// Precisión reportada por iOS en grados (menor = mejor; < 0 = inválido).
    var headingAccuracy: Double = -1
    var authorization: CLAuthorizationStatus = .notDetermined
    var usingMagneticFallback = false
    /// true mientras `location` viene de la sesión anterior (aún sin fix nuevo).
    var isCachedLocation = false

    private static let lastKey = "location.last"
    @ObservationIgnored private var lastSave = Date.distantPast

    @ObservationIgnored private var smoothedSin = 0.0
    @ObservationIgnored private var smoothedCos = 1.0
    @ObservationIgnored private var hasSample = false
    private let smoothing = 0.25 // EMA: 0 = congelado, 1 = sin filtro

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 2
        manager.headingFilter = 0.5
        manager.headingOrientation = .portrait
        authorization = manager.authorizationStatus
        if let d = UserDefaults.standard.dictionary(forKey: Self.lastKey) as? [String: Double],
           let lat = d["lat"], let lon = d["lon"], let alt = d["alt"],
           let h = d["h"], let v = d["v"], let t = d["t"] {
            location = CLLocation(coordinate: .init(latitude: lat, longitude: lon),
                                  altitude: alt, horizontalAccuracy: h, verticalAccuracy: v,
                                  timestamp: Date(timeIntervalSince1970: t))
            isCachedLocation = true
        }
    }

    /// Guarda la última ubicación (máx. 1 escritura cada 5 s).
    private func persist(_ l: CLLocation) {
        guard Date().timeIntervalSince(lastSave) > 5 else { return }
        lastSave = Date()
        UserDefaults.standard.set([
            "lat": l.coordinate.latitude, "lon": l.coordinate.longitude, "alt": l.altitude,
            "h": l.horizontalAccuracy, "v": l.verticalAccuracy, "t": l.timestamp.timeIntervalSince1970,
        ], forKey: Self.lastKey)
    }

    func start() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() {
            manager.startUpdatingHeading()
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
    }

    /// Mantiene la referencia de rumbo coherente con la orientación física.
    func updateOrientation(_ o: UIDeviceOrientation) {
        switch o {
        case .portrait: manager.headingOrientation = .portrait
        case .portraitUpsideDown: manager.headingOrientation = .portraitUpsideDown
        case .landscapeLeft: manager.headingOrientation = .landscapeLeft
        case .landscapeRight: manager.headingOrientation = .landscapeRight
        case .faceUp: manager.headingOrientation = .faceUp
        default: break
        }
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        authorization = m.authorizationStatus
        if authorization == .authorizedWhenInUse || authorization == .authorizedAlways {
            start()
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let last = locs.last, last.horizontalAccuracy >= 0 else { return }
        location = last
        isCachedLocation = false
        persist(last)
    }

    func locationManager(_ m: CLLocationManager, didUpdateHeading h: CLHeading) {
        headingAccuracy = h.headingAccuracy
        guard h.headingAccuracy >= 0 else { return }

        // trueHeading ya corrige la declinación magnética (≈ -5° a -7° en
        // Colombia), pero solo es válido cuando hay fix de ubicación.
        let raw: Double
        if h.trueHeading >= 0 {
            raw = h.trueHeading
            usingMagneticFallback = false
        } else {
            raw = h.magneticHeading
            usingMagneticFallback = true
        }

        // Suavizado circular: promediar sin/cos evita el salto 359°→0°.
        let s = sin(raw.rad), c = cos(raw.rad)
        if hasSample {
            smoothedSin += smoothing * (s - smoothedSin)
            smoothedCos += smoothing * (c - smoothedCos)
        } else {
            smoothedSin = s; smoothedCos = c; hasSample = true
        }
        heading = Geo.normalize(atan2(smoothedSin, smoothedCos).deg)
    }

    func locationManagerShouldDisplayHeadingCalibration(_ m: CLLocationManager) -> Bool {
        headingAccuracy < 0 || headingAccuracy > 15
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        print("CLLocationManager error: \(error.localizedDescription)")
    }
}
