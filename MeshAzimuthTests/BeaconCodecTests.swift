import XCTest
@testable import MeshAzimuth

/// Línea `M` del pinger `proto=2` (spec 005, FR-012): paridad con el fixture del firmware
/// (copia verificada por tools/sync_beacon_fixtures.sh).
final class BeaconCodecTests: XCTestCase {

    func testMeasFixtureParsesToTheExpectedResult() throws {
        let dir = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "beacon", withExtension: nil), "falta beacon/ en el bundle de tests")
        let text = try String(contentsOf: dir.appendingPathComponent("events_m.txt"), encoding: .utf8)
        var count = 0
        for raw in text.split(separator: "\n") {
            let line = raw.trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            if line.hasPrefix("#") || line.isEmpty { continue }
            let parts = line.split(separator: "\t", maxSplits: 1).map(String.init)
            XCTAssertEqual(parts.count, 2, "fixture sin expectativa: \(line)")
            let j = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(parts[1].utf8)) as? [String: Any])
            func d(_ k: String) -> Double { (j[k] as! NSNumber).doubleValue }
            let want = MeasResult(n: (j["n"] as! NSNumber).intValue, kept: (j["kept"] as! NSNumber).intValue,
                                  mean: d("mean"), sd: d("sd"), median: d("median"), min: d("min"), max: d("max"))
            XCTAssertEqual(LineCodec.parse(parts[0]), .meas(want), line)
            count += 1
        }
        XCTAssertGreaterThanOrEqual(count, 4)
    }

    func testMalformedMeasLinesAreUnknown() {
        for line in ["M,64,61,-65.0", "M,64,65,-90.0,0.5,-90.0,-91.0,-89.0", "M,0,0,-90.0,0.5,-90.0,-91.0,-89.0",
                     "M,64,64,x,0.5,-90.0,-91.0,-89.0", "M,", "M,-1,0,-90.0,0.5,-90.0,-91.0,-89.0"] {
            guard case .unknown = LineCodec.parse(line) else { return XCTFail("debería ser .unknown: \(line)") }
        }
    }

    /// El escáner filtra por nombre: catcher nuevo (`PingPong-CA-`) y placas sin reflashear (`PingPong-PI-`).
    func testDeviceKindFromAdvertisedName() {
        func kind(_ n: String) -> PingerDevice.Kind { PingerDevice(id: UUID(), name: n).kind }
        XCTAssertEqual(kind("PingPong-CA-5E58C8AB"), .pingPong)
        XCTAssertEqual(kind("PingPong-PI-5E58C8AB"), .pingPong)
        XCTAssertEqual(kind("YagiPinger-1A2B"), .yagi)
        XCTAssertFalse(PingerDevice.Kind.pingPong.matches("YagiPinger-1A2B"))
        XCTAssertFalse(PingerDevice.Kind.yagi.matches("PingPong-CA-5E58C8AB"))
        XCTAssertFalse(PingerDevice.Kind.pingPong.matches("PingPong-PO-5E58C8AB"))   // otro rol del repo
    }

    func testCleanAtTheEightyPercentLimit() {
        let m = { (kept: Int) in MeasResult(n: 64, kept: kept, mean: -90, sd: 0, median: -90, min: -90, max: -90) }
        XCTAssertFalse(m(51).clean)      // 51 < 51.2
        XCTAssertTrue(m(52).clean)
        XCTAssertTrue(MeasResult(n: 10, kept: 8, mean: 0, sd: 0, median: 0, min: 0, max: 0).clean)   // justo 0.8
    }
}
