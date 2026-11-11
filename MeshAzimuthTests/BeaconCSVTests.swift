import CoreLocation
import XCTest
@testable import MeshAzimuth

/// CSV del barrido (specs/005.../contracts/beacon-sweep-csv.md).
final class BeaconCSVTests: XCTestCase {
    private let utc = TimeZone(identifier: "UTC")!
    private let t0 = Date(timeIntervalSince1970: 1_793_966_400)     // 2026-11-06 12:00:00 UTC

    private func reading(_ dt: Double, heading: Double?, level: Double, valid: Bool) -> BeaconReading {
        BeaconReading(t: t0 + dt, level: level, sd: 0.53, n: 32, kept: valid ? 32 : 20, heading: heading,
                      headingAccuracy: heading == nil ? -1 : 5, pitch: heading == nil ? nil : 1.5, valid: valid)
    }

    private func csv(bisect: BisectResult) -> (text: String, lines: [String]) {
        let site = BeaconSite(id: UUID(uuidString: "6F1C2D3E-0000-4000-8000-000000000001")!, name: "Cerro, \"B\"",
                              latitude: 7.13, longitude: -73.11)
        let text = BeaconCSV.make(id: UUID(uuidString: "00000000-0000-4000-8000-0000000000AA")!, site: site,
                                  observer: .init(latitude: 7.1193, longitude: -73.1227), mapBearing: 49.7, floor: -99.25,
                                  readings: [reading(0, heading: 45.25, level: -66.5, valid: true),
                                             reading(0.2, heading: nil, level: -97, valid: false)],
                                  bisect: bisect, fw: "0.5.1", timeZone: utc)
        return (text, text.components(separatedBy: "\r\n"))
    }

    func testRowsFollowTheContract() {
        let (text, lines) = csv(bisect: .found(center: 52.3, left: 19.1, right: 85.5, beamwidth: 66.4, peak: -65, peakHeading: 51))
        XCTAssertTrue(text.hasSuffix("\r\n"))
        XCTAssertEqual(lines[0], BeaconCSV.header)
        XCTAssertEqual(lines.count, 5)                                  // cabecera, 2 R, 1 B, "" tras el último \r\n
        XCTAssertEqual(lines[1],
            "00000000-0000-4000-8000-0000000000AA,R,2026-11-06T12:00:00.000Z,\"Cerro, \"\"B\"\"\",7.119300,-73.122700,49.7,914.000,-99.25,45.2,5.0,1.5,-66.50,0.53,32,32,1,,,,,,0.5.1")
        // Sin rumbo ni pitch: campos vacíos; no válida.
        XCTAssertEqual(lines[2],
            "00000000-0000-4000-8000-0000000000AA,R,2026-11-06T12:00:00.200Z,\"Cerro, \"\"B\"\"\",7.119300,-73.122700,49.7,914.000,-99.25,,,,-97.00,0.53,32,20,0,,,,,,0.5.1")
        // Fila B: vacías heading…valid, con la estimación; hora de la última lectura.
        XCTAssertEqual(lines[3],
            "00000000-0000-4000-8000-0000000000AA,B,2026-11-06T12:00:00.200Z,\"Cerro, \"\"B\"\"\",7.119300,-73.122700,49.7,914.000,-99.25,,,,,,,,,52.3,19.1,85.5,66.4,-65.00,0.5.1")
        let columns = BeaconCSV.header.split(separator: ",").count
        XCTAssertEqual(columns, 23)
    }

    func testNoBRowWithoutAnEstimate() {
        let (_, lines) = csv(bisect: .needLeft(peak: -65, peakHeading: 51))
        XCTAssertEqual(lines.count, 4)
        XCTAssertFalse(lines.contains { $0.contains(",B,") })
    }

    func testFileName() {
        let site = BeaconSite(name: "Cerro B/Norte", latitude: 0, longitude: 0)
        XCTAssertEqual(BeaconCSV.fileName(site: site, started: t0, timeZone: utc), "meshazimuth_baliza_Cerro_B_Norte_20261106-120000.csv")
    }
}
