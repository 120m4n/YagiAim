import CoreLocation
import Foundation

/// Un `PING` con el rumbo del teléfono en el instante de transmitir y al recibir el resultado.
struct Sample: Codable, Identifiable, Equatable {
    var id = UUID()
    var readingIndex: Int            // 1-based
    var tTx: Date
    var tRx: Date
    var headingTx: Double            // rumbo verdadero del boom al escribir el comando
    var headingRx: Double            // ... al recibir el `P,` (≈ 1.4 s después)
    var headingAccuracy: Double
    var latitude: Double
    var longitude: Double
    var altitude: Double?
    var hAccuracy: Double
    var targetBearing: Double        // azimut calculado al repetidor
    var delta: Double                // targetBearing − headingTx, en (−180, 180]; positivo = girar a la derecha
    var unstable: Bool               // el teléfono se movió más del umbral entre TX y RX
    var invalid: Bool                // el pinger retrasó el TX (`#WARN duty_wait`): headingTx ya no corresponde
    var result: PingResult
}

/// Resumen de N muestras tomadas con la antena quieta.
struct Reading: Codable, Identifiable, Equatable {
    var id = UUID()
    var index: Int                   // 1-based
    var meanHeading: Double?         // media circular de headingTx de las muestras usadas
    var meanDelta: Double?           // media circular de delta (correcta también cerca de ±180°)
    var medSnrUp: Double?
    var medSnrDn: Double?
    var medRssiDn: Double?
    var lossPct: Int?                // 100·timeouts/(ok+timeouts), sobre todas las muestras; nil sin datos
    var stableCount: Int             // muestras `ok`, no inestables y no inválidas
    var needsRepeat: Bool            // stableCount < 3
}

struct Session: Codable, Identifiable, Equatable {
    var id = UUID()
    var repeater: Repeater           // instantánea al empezar
    var started: Date
    var txpDbm: Int?
    var fw: String?
    var proto: Int
    var readings: [Reading] = []
    var samples: [Sample] = []
}

/// Reglas de negocio de las lecturas. Puras y sin E/S: son lo que hay que probar.
enum SessionRules {
    static let unstableThreshold = 2.0      // grados entre headingTx y headingRx
    static let minStableSamples = 3
    static let maxHeadingAccuracy = 15.0

    /// La brújula sirve si iOS reporta una precisión no negativa y de a lo sumo 15°.
    static func headingIsValid(_ accuracy: Double) -> Bool { accuracy >= 0 && accuracy <= maxHeadingAccuracy }

    static func makeSample(readingIndex: Int, report: PingReport, headingTx: Double, headingRx: Double,
                           headingAccuracy: Double, location: CLLocation, targetBearing: Double,
                           threshold: Double = unstableThreshold) -> Sample {
        let moved = abs(Geo.signedDelta(target: headingRx, current: headingTx))
        return Sample(readingIndex: readingIndex, tTx: report.tTx, tRx: report.tRx,
                      headingTx: headingTx, headingRx: headingRx, headingAccuracy: headingAccuracy,
                      latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                      altitude: location.verticalAccuracy >= 0 ? location.altitude : nil,
                      hAccuracy: location.horizontalAccuracy, targetBearing: targetBearing,
                      delta: Geo.signedDelta(target: targetBearing, current: headingTx),
                      unstable: moved > threshold, invalid: report.dutyWait, result: report.result)
    }

    static func makeReading(index: Int, samples: [Sample]) -> Reading {
        let usable = samples.filter { $0.result.status == .ok && !$0.unstable && !$0.invalid }
        let timeouts = samples.filter { $0.result.status == .timeout }.count
        let answered = samples.filter { $0.result.status == .ok || $0.result.status == .timeout }.count

        return Reading(
            index: index,
            meanHeading: Geo.circularMean(usable.map(\.headingTx)),
            meanDelta: Geo.circularMean(usable.map(\.delta)).map { Geo.signedDelta(target: $0, current: 0) },
            medSnrUp: Geo.median(usable.compactMap(\.result.snrUp)),
            medSnrDn: Geo.median(usable.compactMap(\.result.snrDn)),
            medRssiDn: Geo.median(usable.compactMap(\.result.rssiDn)),
            lossPct: answered == 0 ? nil : Int((100.0 * Double(timeouts) / Double(answered)).rounded()),
            stableCount: usable.count,
            needsRepeat: usable.count < minStableSamples)
    }
}
