import Foundation

/// Estimación del rumbo por los puntos de −3 dB (spec 005, FR-024; research R-2).
enum BisectResult: Equatable {
    /// `left`/`right`: cruces de −3 dB (left = sentido antihorario desde el máximo). `beamwidth` = de left a right.
    case found(center: Double, left: Double, right: Double, beamwidth: Double, peak: Double, peakHeading: Double)
    case needLeft(peak: Double, peakHeading: Double)     // falta cruzar −3 dB girando a la izquierda
    case needRight(peak: Double, peakHeading: Double)
    case notEnough

    var center: Double? { if case .found(let c, _, _, _, _, _) = self { c } else { nil } }
}

/// Función pura: sin sensores ni BLE.
enum BeaconBisect {
    static let binDeg = 2.0
    /// Un hueco sin lecturas mayor que esto corta ese lado (no se interpola a ciegas).
    static let maxGapDeg = 20.0
    private static let bins = Int(360 / binDeg)

    /// `readings`: solo cuentan las válidas con rumbo. Celdas de 2° con la media de cada una; desde la celda
    /// del máximo se recorre cada lado hasta el primer valor ≤ máximo − `drop`, interpolando linealmente.
    static func estimate(_ readings: [BeaconReading], drop: Double = 3) -> BisectResult {
        // Media por celda, no el máximo: con 0,5 dB de ruido acierta a ±3° el 99 % de los barridos frente al 97 %.
        var sum: [Int: (total: Double, count: Double)] = [:]
        for r in readings where r.valid {
            guard let h = r.heading else { continue }
            let i = Int(Geo.normalize(h) / binDeg) % bins
            sum[i, default: (0, 0)].total += r.level
            sum[i, default: (0, 0)].count += 1
        }
        let cell = sum.mapValues { $0.total / $0.count }
        guard cell.count >= 3, let best = cell.max(by: { $0.value < $1.value }) else { return .notEnough }
        let peakBin = best.key, peak = best.value
        let peakHeading = (Double(peakBin) + 0.5) * binDeg
        let threshold = peak - drop

        /// Desfase en grados (≥ 0) desde el centro de la celda del máximo hasta el cruce, o nil.
        func crossing(_ dir: Int) -> Double? {
            var lastStep = 0, lastLevel = peak, gap = 0.0
            for step in 1..<bins {
                guard let v = cell[((peakBin + dir * step) % bins + bins) % bins] else {
                    gap += binDeg
                    if gap > maxGapDeg { return nil }
                    continue
                }
                if v <= threshold {
                    let frac = (lastLevel - threshold) / (lastLevel - v)
                    return (Double(lastStep) + Double(step - lastStep) * frac) * binDeg
                }
                lastStep = step; lastLevel = v; gap = 0
            }
            return nil
        }

        switch (crossing(-1), crossing(+1)) {
        case let (l?, r?):
            let left = Geo.normalize(peakHeading - l), right = Geo.normalize(peakHeading + r)
            let width = l + r
            return .found(center: Geo.normalize(left + width / 2), left: left, right: right,
                          beamwidth: width, peak: peak, peakHeading: peakHeading)
        case (nil, _?): return .needLeft(peak: peak, peakHeading: peakHeading)
        case (_?, nil): return .needRight(peak: peak, peakHeading: peakHeading)
        case (nil, nil): return .notEnough
        }
    }
}
