import CoreLocation
import XCTest
@testable import MeshAzimuth

final class GeoTests: XCTestCase {
    private let cali = CLLocationCoordinate2D(latitude: 3.4516, longitude: -76.5320)
    private let bogota = CLLocationCoordinate2D(latitude: 4.7110, longitude: -74.0721)

    func testUnwrapTakesShortPathAcrossNorthAndSouth() {
        XCTAssertEqual(Geo.unwrap(previous: 359, new: 1), 361, accuracy: 1e-9)
        XCTAssertEqual(Geo.unwrap(previous: 361, new: 359), 359, accuracy: 1e-9)
        XCTAssertEqual(Geo.unwrap(previous: 1, new: 359), -1, accuracy: 1e-9)
        XCTAssertEqual(Geo.unwrap(previous: 179, new: -179), 181, accuracy: 1e-9)
        XCTAssertEqual(Geo.unwrap(previous: 0, new: 0), 0, accuracy: 1e-9)
    }

    func testCardinalBearings() {
        let o = CLLocationCoordinate2D(latitude: 0, longitude: 0)
        XCTAssertEqual(Geo.bearing(from: o, to: .init(latitude: 1, longitude: 0)), 0, accuracy: 1e-9)
        XCTAssertEqual(Geo.bearing(from: o, to: .init(latitude: 0, longitude: 1)), 90, accuracy: 1e-9)
        XCTAssertEqual(Geo.bearing(from: o, to: .init(latitude: -1, longitude: 0)), 180, accuracy: 1e-9)
        XCTAssertEqual(Geo.bearing(from: o, to: .init(latitude: 0, longitude: -1)), 270, accuracy: 1e-9)
    }

    func testCaliToBogota() {
        // Referencia esférica independiente (Python): 62.75°, 306.67 km
        XCTAssertEqual(Geo.bearing(from: cali, to: bogota), 62.75, accuracy: 0.01)
        XCTAssertEqual(Geo.distance(from: cali, to: bogota) / 1000, 306.67, accuracy: 0.01)
    }

    func testSignedDeltaWraps() {
        XCTAssertEqual(Geo.signedDelta(target: 10, current: 350), 20, accuracy: 1e-9)
        XCTAssertEqual(Geo.signedDelta(target: 350, current: 10), -20, accuracy: 1e-9)
        XCTAssertEqual(Geo.signedDelta(target: 180, current: 0), 180, accuracy: 1e-9)
    }

    func testCardinalNames() {
        XCTAssertEqual(Geo.cardinal(0), "N")
        XCTAssertEqual(Geo.cardinal(359), "N")
        XCTAssertEqual(Geo.cardinal(225), "SO")
    }

    func testAlignmentHysteresis() {
        // Entra a ±3, se mantiene hasta ±5, sale por encima.
        XCTAssertFalse(Geo.isAligned(delta: 4, tolerance: 3, wasAligned: false))
        XCTAssertTrue(Geo.isAligned(delta: 2.9, tolerance: 3, wasAligned: false))
        XCTAssertTrue(Geo.isAligned(delta: 4.5, tolerance: 3, wasAligned: true))
        XCTAssertFalse(Geo.isAligned(delta: 5.5, tolerance: 3, wasAligned: true))
        XCTAssertFalse(Geo.isAligned(delta: nil, tolerance: 3, wasAligned: true))
    }

    // MARK: - normalize (borde)

    func testNormalizeNeverReturns360() {
        XCTAssertEqual(Geo.normalize(-1e-18), 0)   // r + 360 se redondea a 360.0 exacto
        XCTAssertEqual(Geo.normalize(360), 0)
        XCTAssertEqual(Geo.normalize(-90), 270, accuracy: 1e-9)
    }

    // MARK: - circularMean (research R-5)

    func testCircularMeanAcrossNorth() {
        XCTAssertEqual(Geo.circularMean([359, 1])!, 0, accuracy: 1e-9)       // no 180
        XCTAssertEqual(Geo.circularMean([358, 2, 0])!, 0, accuracy: 1e-9)
        // 350° y 10° se anulan en seno; con 30°: atan2(0.5, 2.8356) = 10° (el promedio aritmético daría 130°)
        XCTAssertEqual(Geo.circularMean([350, 10, 30])!, 10, accuracy: 1e-9)
    }

    func testCircularMeanOrdinaryCases() {
        XCTAssertEqual(Geo.circularMean([10, 20, 30])!, 20, accuracy: 1e-9)
        XCTAssertEqual(Geo.circularMean([90])!, 90, accuracy: 1e-9)
        XCTAssertEqual(Geo.circularMean([270, 270])!, 270, accuracy: 1e-9)
    }

    func testCircularMeanResultIsInZeroTo360() {
        for set in [[359.0, 1], [355, 5, 0], [180, 181], [0.0001, 359.9999]] {
            let m = Geo.circularMean(set)!
            XCTAssertTrue(m >= 0 && m < 360, "\(set) -> \(m)")
        }
    }

    func testCircularMeanUndefinedCases() {
        XCTAssertNil(Geo.circularMean([]))
        XCTAssertNil(Geo.circularMean([0, 180]))     // vectores opuestos: no hay rumbo medio
    }

    // MARK: - median (misma regla que la línea S de la 001)

    func testMedianOddEvenSingleEmpty() {
        XCTAssertEqual(Geo.median([3, 1, 2]), 2)
        XCTAssertEqual(Geo.median([1, 2, 3, 4]), 2.5)           // n par: promedio de los centrales
        XCTAssertEqual(Geo.median([5]), 5)
        XCTAssertNil(Geo.median([]))
    }

    func testMedianWithNegativesAndUnsortedInput() {
        XCTAssertEqual(Geo.median([-4.5, -6.25])!, -5.375, accuracy: 1e-12)
        XCTAssertEqual(Geo.median([9.0, -3, 4, 4, 100])!, 4)
        let input = [3.0, 1, 2]
        _ = Geo.median(input)
        XCTAssertEqual(input, [3, 1, 2])                        // no muta la entrada
    }
}
