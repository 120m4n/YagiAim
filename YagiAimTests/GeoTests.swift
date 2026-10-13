import CoreLocation
import XCTest
@testable import YagiAim

final class GeoTests: XCTestCase {
    private let cali = CLLocationCoordinate2D(latitude: 3.4516, longitude: -76.5320)
    private let bogota = CLLocationCoordinate2D(latitude: 4.7110, longitude: -74.0721)

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
}
