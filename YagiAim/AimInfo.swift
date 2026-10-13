import CoreLocation

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
