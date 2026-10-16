import CoreLocation

/// Cálculos geodésicos sobre esfera (suficiente para enlaces LoRa de < 200 km).
enum Geo {
    private static let earthRadius = 6_371_008.8 // m (radio medio IUGG)

    /// Azimut inicial (rumbo verdadero, 0° = norte geográfico, sentido horario).
    static func bearing(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
        let φ1 = a.latitude.rad, φ2 = b.latitude.rad
        let Δλ = (b.longitude - a.longitude).rad
        let y = sin(Δλ) * cos(φ2)
        let x = cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ)
        return normalize(atan2(y, x).deg)
    }

    /// Distancia de círculo máximo (haversine), en metros.
    static func distance(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
        let φ1 = a.latitude.rad, φ2 = b.latitude.rad
        let Δφ = (b.latitude - a.latitude).rad
        let Δλ = (b.longitude - a.longitude).rad
        let h = sin(Δφ / 2) * sin(Δφ / 2) + cos(φ1) * cos(φ2) * sin(Δλ / 2) * sin(Δλ / 2)
        return 2 * earthRadius * atan2(sqrt(h), sqrt(1 - h))
    }

    /// Ángulo de elevación aproximado hacia el repetidor, corrigiendo curvatura
    /// terrestre con factor k = 4/3 (refracción atmosférica estándar en RF).
    static func elevation(distance d: Double, ownAltitude h1: Double, targetAltitude h2: Double) -> Double {
        guard d > 1 else { return 0 }
        let effectiveRadius = earthRadius * 4.0 / 3.0
        let drop = (d * d) / (2 * effectiveRadius)
        return atan2(h2 - h1 - drop, d).deg
    }

    /// Diferencia con signo en (-180, 180]: positivo = girar a la derecha.
    static func signedDelta(target: Double, current: Double) -> Double {
        var d = (target - current).truncatingRemainder(dividingBy: 360)
        if d > 180 { d -= 360 }
        if d <= -180 { d += 360 }
        return d
    }

    /// Valor "desenrollado": `new` llevado al equivalente más cercano a `previous` (puede salirse de 0–360),
    /// para animar rotaciones por el camino corto al cruzar 360°/0°.
    static func unwrap(previous: Double, new: Double) -> Double {
        previous + signedDelta(target: new, current: previous)
    }

    /// Histéresis: entra a ±tolerancia y solo sale a ±(tolerancia + margen), para que
    /// el verde y la vibración no parpadeen cuando el rumbo oscila en el borde.
    static func isAligned(delta: Double?, tolerance: Double, wasAligned: Bool, exitMargin: Double = 2) -> Bool {
        guard let delta else { return false }
        return abs(delta) <= (wasAligned ? tolerance + exitMargin : tolerance)
    }

    /// Lleva un ángulo a [0, 360). Un negativo diminuto (-1e-18) no debe dar 360.0 por redondeo.
    static func normalize(_ deg: Double) -> Double {
        let r = deg.truncatingRemainder(dividingBy: 360)
        let n = r < 0 ? r + 360 : r
        return n >= 360 ? 0 : n
    }

    /// Rumbo medio circular en [0, 360): atan2(Σ sin, Σ cos). 359° y 1° dan 0°, no 180° (research R-5).
    /// nil si no hay datos o si los vectores se anulan (p. ej. 0° y 180°): entonces no existe un rumbo medio.
    static func circularMean(_ degrees: [Double]) -> Double? {
        guard !degrees.isEmpty else { return nil }
        let s = degrees.reduce(0) { $0 + sin($1.rad) }
        let c = degrees.reduce(0) { $0 + cos($1.rad) }
        guard hypot(s, c) > 1e-9 else { return nil }
        return normalize(atan2(s, c).deg)
    }

    /// Mediana; con n par, el promedio de los dos centrales (misma regla que la línea `S,` del pinger).
    static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let v = values.sorted()
        let m = v.count / 2
        return v.count % 2 == 1 ? v[m] : (v[m - 1] + v[m]) / 2
    }

    static func cardinal(_ deg: Double) -> String {
        let names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                     "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]
        return names[Int((normalize(deg) + 11.25) / 22.5) % 16]
    }
}

extension Double {
    var rad: Double { self * .pi / 180 }
    var deg: Double { self * 180 / .pi }
}
