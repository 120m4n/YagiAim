import XCTest
@testable import MeshAzimuth

/// Bisección a −3 dB (spec 005, FR-024, SC-003): función pura, barridos sintéticos con el patrón `yagiGain`
/// del simulador (haz de −3 dB ≈ 67°).
final class BeaconBisectTests: XCTestCase {

    /// Barrido de `from`…`to` grados alrededor de `truth`, cada 0,7°, cuantizado a 0,5 dB como el pinger.
    private func sweep(_ truth: Double, from: Double = -60, to: Double = 60, sigma: Double = 0, rng: inout SplitMix64,
                       gain: (Double) -> Double = { SimulatedPinger.yagiGain(deltaDeg: $0) }) -> [BeaconReading] {
        stride(from: from, through: to, by: 0.7).map { d in
            let level = ((-65 + gain(d) + rng.gaussian() * sigma) * 2).rounded() / 2
            return BeaconReading(t: .now, level: level, sd: 0.5, n: 32, kept: 32, heading: Geo.normalize(truth + d),
                                 headingAccuracy: 5, pitch: 0, valid: true)
        }
    }

    private func found(_ r: BisectResult, file: StaticString = #filePath, line: UInt = #line)
        -> (center: Double, left: Double, right: Double, width: Double)? {
        guard case .found(let c, let l, let rr, let w, _, _) = r else { XCTFail("sin centro: \(r)", file: file, line: line); return nil }
        return (c, l, rr, w)
    }

    private func off(_ a: Double, _ b: Double) -> Double { abs(Geo.signedDelta(target: a, current: b)) }

    func testSymmetricPatternFindsTheCenter() throws {
        var rng = SplitMix64(seed: 1)
        let f = try XCTUnwrap(found(BeaconBisect.estimate(sweep(37, rng: &rng))))
        XCTAssertLessThanOrEqual(off(f.center, 37), 1)
        XCTAssertEqual(f.width, 67, accuracy: 3)
    }

    func testAsymmetricPatternUsesTheMidpointOfTheCrossings() throws {
        var rng = SplitMix64(seed: 1)
        // El lado izquierdo cae 1,5 veces más rápido: cruces a ≈ −22° y +33.5°.
        let rs = sweep(37, rng: &rng) { SimulatedPinger.yagiGain(deltaDeg: $0 < 0 ? $0 * 1.5 : $0) }
        let f = try XCTUnwrap(found(BeaconBisect.estimate(rs)))
        XCTAssertEqual(f.left, 37 - 33.5 / 1.5, accuracy: 1.5)
        XCTAssertEqual(f.right, 37 + 33.5, accuracy: 1.5)
        XCTAssertLessThanOrEqual(off(f.center, Geo.normalize(f.left + f.width / 2)), 0.01)
    }

    /// SC-003: con 0,5 dB de ruido, el centro a ±3° en ≥ 9 de cada 10 barridos de ±60°.
    func testNoisySweepsMeetSC003() {
        var rng = SplitMix64(seed: 42)
        let runs = 100
        let ok = (0..<runs).filter { _ in
            BeaconBisect.estimate(sweep(37, sigma: 0.5, rng: &rng)).center.map { off($0, 37) <= 3 } ?? false
        }.count
        XCTAssertGreaterThanOrEqual(ok, runs * 9 / 10, "\(ok)/\(runs)")
    }

    func testCenterAcrossNorthUsesCircularGeometry() throws {
        var rng = SplitMix64(seed: 1)
        let f = try XCTUnwrap(found(BeaconBisect.estimate(sweep(358, rng: &rng))))
        XCTAssertLessThanOrEqual(off(f.center, 358), 1)
        XCTAssertGreaterThan(f.left, 300)       // 325°
        XCTAssertLessThan(f.right, 60)          // 31°
    }

    func testOneSidedSweepSaysWhichSideIsMissing() {
        var rng = SplitMix64(seed: 1)
        guard case .needRight = BeaconBisect.estimate(sweep(100, from: -60, to: 5, rng: &rng)) else { return XCTFail("debería pedir la derecha") }
        guard case .needLeft = BeaconBisect.estimate(sweep(100, from: -5, to: 60, rng: &rng)) else { return XCTFail("debería pedir la izquierda") }
    }

    func testInvalidReadingsAreIgnored() throws {
        var rng = SplitMix64(seed: 1)
        var rs = sweep(37, rng: &rng)
        // Lecturas fuertes pero no válidas (tráfico ajeno, brújula imprecisa) en otro rumbo: no cuentan.
        rs += (0..<20).map { i in BeaconReading(t: .now, level: -40, sd: 0, n: 32, kept: 10, heading: 200 + Double(i),
                                                headingAccuracy: 5, pitch: 0, valid: false) }
        rs.append(BeaconReading(t: .now, level: -40, sd: 0, n: 32, kept: 32, heading: nil, headingAccuracy: -1, pitch: nil, valid: false))
        let f = try XCTUnwrap(found(BeaconBisect.estimate(rs)))
        XCTAssertLessThanOrEqual(off(f.center, 37), 1)
    }

    func testGapWiderThan20DegreesCutsThatSide() {
        var rng = SplitMix64(seed: 1)
        // Sin lecturas entre −45° y −15°: el cruce izquierdo (≈ −33.5°) cae en el hueco y no se inventa.
        let rs = sweep(37, rng: &rng).filter { r in
            let d = Geo.signedDelta(target: r.heading!, current: 37)
            return !(d > -45 && d < -15)
        }
        guard case .needLeft = BeaconBisect.estimate(rs) else { return XCTFail("un hueco de 30° debería cortar el lado izquierdo") }
    }

    func testFewerThanThreeCellsIsNotEnough() {
        var rng = SplitMix64(seed: 1)
        XCTAssertEqual(BeaconBisect.estimate(sweep(100, from: 0, to: 3, rng: &rng)), .notEnough)
        XCTAssertEqual(BeaconBisect.estimate([]), .notEnough)
    }
}
