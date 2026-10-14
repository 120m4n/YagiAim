import CoreLocation
import XCTest
@testable import MeshAzimuth

/// Reglas de las lecturas (spec 003 FR-014/FR-015): inestabilidad, invalidez, medianas, pérdida y media circular.
final class SessionRulesTests: XCTestCase {
    private let here = CLLocation(coordinate: .init(latitude: 3.45, longitude: -76.53), altitude: 1000,
                                  horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date())

    private func report(_ status: PingResult.Status = .ok, up: Double? = -6.25, dn: Double? = -4.5, rssi: Double? = -108,
                        duty: Bool = false) -> PingReport {
        let ok = status == .ok
        let r = PingResult(seq: 1, tag: "AABBCCDD", status: status, rttMs: ok ? 300 : nil, snrUp: ok ? up : nil,
                           snrDn: ok ? dn : nil, rssiDn: ok ? rssi : nil, nResp: ok ? 1 : 0)
        return PingReport(result: r, tTx: Date(), tRx: Date(), dutyWait: duty)
    }

    private func sample(hTx: Double = 100, moved: Double = 0, target: Double = 100, _ rep: PingReport) -> Sample {
        SessionRules.makeSample(readingIndex: 1, report: rep, headingTx: hTx, headingRx: Geo.normalize(hTx + moved),
                                headingAccuracy: 5, location: here, targetBearing: target)
    }

    // MARK: - unstable

    func testUnstableThresholdIsExclusive() {
        XCTAssertFalse(sample(moved: 2.0, report()).unstable)    // exactamente 2° no es inestable
        XCTAssertTrue(sample(moved: 2.1, report()).unstable)
        XCTAssertTrue(sample(moved: -3, report()).unstable)      // vale en ambos sentidos
    }

    func testUnstableAcrossNorth() {
        XCTAssertFalse(sample(hTx: 359, moved: 2, report()).unstable)   // 359° → 1°: se movió 2°, no 358°
        XCTAssertTrue(sample(hTx: 359, moved: 4, report()).unstable)
    }

    // MARK: - invalid

    func testDutyWaitMakesTheSampleInvalidAndExcludedFromTheMedian() {
        let good = (0..<4).map { _ in sample(report(up: -6.0)) }
        let delayed = sample(report(up: +20.0, duty: true))      // ok, pero el TX se retrasó
        XCTAssertTrue(delayed.invalid)
        XCTAssertFalse(delayed.unstable)
        let r = SessionRules.makeReading(index: 1, samples: good + [delayed])
        XCTAssertEqual(r.stableCount, 4)
        XCTAssertEqual(r.medSnrUp, -6.0)                         // el +20 no entra
    }

    // MARK: - medianas y estabilidad de la lectura

    func testFiveStableSamplesGiveTheMedians() {
        let ups = [-6.25, -6.0, -5.75, -6.5, -6.25]
        let r = SessionRules.makeReading(index: 1, samples: ups.map { sample(report(up: $0, dn: $0 + 2, rssi: $0 * 10)) })
        XCTAssertEqual(r.medSnrUp, -6.25)
        XCTAssertEqual(r.medSnrDn, -4.25)
        XCTAssertEqual(r.medRssiDn, -62.5)
        XCTAssertEqual(r.stableCount, 5)
        XCTAssertFalse(r.needsRepeat)
        XCTAssertEqual(r.lossPct, 0)
    }

    func testEvenCountMedianAveragesTheMiddlePair() {
        let r = SessionRules.makeReading(index: 1, samples: [-6.25, -4.5, -3.0, -8.0].map { sample(report(up: $0)) })
        XCTAssertEqual(r.medSnrUp!, (-6.25 + -4.5) / 2, accuracy: 1e-12)   // ordenado: -8, -6.25, -4.5, -3
    }

    func testUnstableSamplesAreExcludedFromTheMedians() {
        let stable = (0..<3).map { _ in sample(report(up: -6.0)) }
        let moving = (0..<2).map { _ in sample(moved: 3, report(up: +15.0)) }
        let r = SessionRules.makeReading(index: 1, samples: stable + moving)
        XCTAssertEqual(r.stableCount, 3)
        XCTAssertEqual(r.medSnrUp, -6.0)
        XCTAssertFalse(r.needsRepeat)
    }

    func testFewerThanThreeStableSamplesNeedsRepeat() {
        let r = SessionRules.makeReading(index: 1, samples: [sample(report()), sample(report())] + (0..<3).map { _ in sample(moved: 5, report()) })
        XCTAssertEqual(r.stableCount, 2)
        XCTAssertTrue(r.needsRepeat)
    }

    func testNoUsableSamplesLeavesEverythingEmpty() {
        let r = SessionRules.makeReading(index: 1, samples: (0..<3).map { _ in sample(report(.timeout)) })
        XCTAssertNil(r.medSnrUp)
        XCTAssertNil(r.meanHeading)
        XCTAssertNil(r.meanDelta)
        XCTAssertEqual(r.stableCount, 0)
        XCTAssertTrue(r.needsRepeat)
        XCTAssertEqual(r.lossPct, 100)
    }

    // MARK: - pérdida

    func testLossCountsTimeoutsOverAnsweredPingsAndIgnoresBusy() {
        let r1 = SessionRules.makeReading(index: 1, samples: [sample(report()), sample(report()), sample(report()), sample(report()), sample(report(.timeout))])
        XCTAssertEqual(r1.lossPct, 20)
        let r2 = SessionRules.makeReading(index: 1, samples: [sample(report()), sample(report()), sample(report(.timeout)), sample(report(.busy))])
        XCTAssertEqual(r2.lossPct, 33)                           // 1/3: busy no cuenta
        let r3 = SessionRules.makeReading(index: 1, samples: [sample(report(.busy)), sample(report(.txerr))])
        XCTAssertNil(r3.lossPct)
    }

    // MARK: - rumbo y delta

    func testDeltaIsSignedLikeTheUI() {
        XCTAssertEqual(sample(hTx: 350, target: 10, report()).delta, 20, accuracy: 1e-9)    // girar a la derecha
        XCTAssertEqual(sample(hTx: 10, target: 350, report()).delta, -20, accuracy: 1e-9)
    }

    func testMeanHeadingIsCircular() {
        let r = SessionRules.makeReading(index: 1, samples: [358, 2, 0].map { sample(hTx: $0, target: $0, report()) })
        XCTAssertEqual(Geo.signedDelta(target: r.meanHeading!, current: 0), 0, accuracy: 1e-9)   // no 120°
    }

    func testMeanDeltaDoesNotCollapseNearOppositeDirection() {
        // Antena apuntando al revés: deltas +179 y -179. La media aritmética daría 0 (¡alineado!); debe dar ±180.
        let a = sample(hTx: 100, target: 279, report()), b = sample(hTx: 100, target: 281 - 360 + 360 - 2 + 0.0, report())
        XCTAssertEqual(a.delta, 179, accuracy: 1e-9)
        let c = sample(hTx: 100, target: 100 - 179, report())
        XCTAssertEqual(c.delta, -179, accuracy: 1e-9)
        _ = b
        let r = SessionRules.makeReading(index: 1, samples: [a, c])
        XCTAssertGreaterThan(abs(r.meanDelta!), 179)
    }

    // MARK: - brújula

    func testHeadingAccuracyRule() {
        XCTAssertFalse(SessionRules.headingIsValid(-1))
        XCTAssertTrue(SessionRules.headingIsValid(0))
        XCTAssertTrue(SessionRules.headingIsValid(15))
        XCTAssertFalse(SessionRules.headingIsValid(15.1))
        XCTAssertFalse(SessionRules.headingIsValid(20))
    }
}
