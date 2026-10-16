import CoreLocation
import Foundation
import Observation

/// Toma lecturas atadas al rumbo: una ráfaga de `PING` con la antena quieta (botón "Medir aquí").
@MainActor @Observable
final class SessionRecorder {
    enum MeasureError: Error, Equatable {
        case notReady            // sin enlace operativo con el pinger
        case noHash              // el repetidor no tiene prefijo hash
        case needsCalibration    // brújula sin calibrar o con precisión > 15°
        case noLocation
        case measuring           // ya hay una medición en curso
    }

    private(set) var current: Session?
    private(set) var measuring = false
    private(set) var done = 0
    private(set) var total = 0

    @ObservationIgnored private let store: SessionStore?

    init(store: SessionStore? = SessionStore()) { self.store = store }

    /// Empieza una sesión nueva para este repetidor (la siguiente medición la crea si no existe).
    func startSession() { current = nil }

    /// Mide `count` pings consecutivos. Cada muestra guarda el rumbo al TX y al RX, la ubicación y el `P,`.
    /// Pausa el modo "En vivo" mientras dura y lo retoma al terminar.
    @discardableResult
    func measureHere(link: PingerLink, location loc: LocationManager, repeater: Repeater, count: Int = 5) async throws -> Reading {
        guard !measuring else { throw MeasureError.measuring }
        guard link.isOperational else { throw MeasureError.notReady }
        guard let hash = repeater.hashPrefix else { throw MeasureError.noHash }
        guard SessionRules.headingIsValid(loc.headingAccuracy), loc.heading != nil else { throw MeasureError.needsCalibration }
        guard loc.location != nil else { throw MeasureError.noLocation }

        measuring = true; done = 0; total = count
        let wasLive = link.live
        defer { measuring = false; if wasLive { link.startLive() } }
        await link.stopLiveAndWait()

        if link.hash != hash { try await link.configure(hash: hash) }

        var session = current ?? Session(repeater: repeater, started: Date(), txpDbm: link.config["txp"].flatMap(Int.init),
                                         fw: link.device?.fw, proto: link.device?.proto ?? 1)
        let index = session.readings.count + 1
        let interval = max(PingerLink.minLiveInterval, .milliseconds(Int(link.config["rate"] ?? "") ?? 0))
        let target = Geo.bearing(from: (loc.location ?? CLLocation()).coordinate, to: repeater.coordinate)

        var samples: [Sample] = []
        for i in 0..<count {
            let started = ContinuousClock.now
            var tx: (heading: Double, accuracy: Double, location: CLLocation)?
            do {
                let report = try await link.ping(onSent: {
                    if let h = loc.heading, let l = loc.location { tx = (h, loc.headingAccuracy, l) }
                })
                if let tx, let hRx = loc.heading {
                    samples.append(SessionRules.makeSample(readingIndex: index, report: report, headingTx: tx.heading, headingRx: hRx,
                                                           headingAccuracy: tx.accuracy, location: tx.location, targetBearing: target))
                }
            } catch PingerError.rejected {
                // el pinger estaba ocupado o sin hash: esa muestra no se toma
            } catch LinkError.timeout {
                // sin respuesta local: se omite la muestra
            }
            done = i + 1
            if i < count - 1 { try? await Task.sleep(until: started + interval, clock: .continuous) }
        }

        let reading = SessionRules.makeReading(index: index, samples: samples)
        session.readings.append(reading)
        session.samples.append(contentsOf: samples)
        current = session
        try? store?.save(session)
        return reading
    }
}
