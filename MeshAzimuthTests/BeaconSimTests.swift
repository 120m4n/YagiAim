import XCTest
@testable import MeshAzimuth

/// Enlace de baliza contra el pinger simulado en modo baliza (spec 005, FR-011, FR-013, FR-021, FR-022, FR-028).
@MainActor
final class BeaconSimTests: XCTestCase {

    /// Baliza simulada a `target + 4°`; el teléfono apunta a `heading`.
    private func makeLink(kind: PingerDevice.Kind = .pingPong, beacon: Bool = true,
                          heading: Double = 37, target: Double = 33) -> PingerLink {
        PingerLink(kind: kind) { _ in
            var c = SimulatedPinger.Config()
            c.delayScale = 0.2
            if beacon { c.beacon = .init() }
            return SimulatedPinger(config: c, heading: { heading }, targetBearing: { target })
        }
    }

    private func waitUntil(_ timeout: Double = 3, _ condition: () -> Bool) async {
        let end = Date.now + timeout
        while !condition() && Date.now < end { try? await Task.sleep(for: .milliseconds(20)) }
    }

    func testHandshakeAcceptsProto2OnlyOnTheBeaconLink() async {
        let beacon = makeLink()
        await beacon.connect(hash: nil)
        XCTAssertTrue(beacon.isOperational)

        let trace = makeLink(kind: .yagi)           // TRACE no acepta el pinger proto=2
        await trace.connect(hash: nil)
        XCTAssertEqual(trace.state, .failed(.incompatibleFirmware(proto: 2)))

        let old = makeLink(beacon: false)           // ni el enlace de baliza el proto=1
        await old.connect(hash: nil)
        XCTAssertEqual(old.state, .failed(.incompatibleFirmware(proto: 1)))
    }

    func testFirmwareVersionsCompareNumerically() {
        XCTAssertTrue(PingerLink.firmware("0.5.1", atLeast: "0.5.1"))
        XCTAssertTrue(PingerLink.firmware("0.10.0", atLeast: "0.5.1"))
        XCTAssertFalse(PingerLink.firmware("0.5.0", atLeast: "0.5.1"))
    }

    func testMeasHearsTheBeaconOnlyOnItsFrequency() async throws {
        let link = makeLink()
        await link.connect(hash: nil)
        try await link.setFrequency("914.000")
        let on = try await link.meas()
        XCTAssertGreaterThan(on.mean, -70)                     // −65 dBm en el centro del haz
        XCTAssertEqual(on.n, PingerLink.meterSamples)

        try await link.setFrequency("913.000")
        let floor = try await link.meas(n: 64)
        XCTAssertEqual(floor.mean, -99, accuracy: 2)
        XCTAssertEqual(link.freq, "913.000")
    }

    func testTraceCommandsAreRejectedOnTheBeaconLink() async {
        let link = makeLink()
        await link.connect(hash: nil)
        do { _ = try await link.ping(); XCTFail("ping() debería rechazarse") } catch {
            XCTAssertEqual(error as? PingerError, .rejected(code: "mode", detail: "baliza"))
        }
        link.startLive()
        XCTAssertFalse(link.live)
    }

    func testMeterDeliversReadingsUntilStopped() async {
        let link = makeLink()
        await link.connect(hash: nil)
        var got: [MeasResult] = []
        link.startMeter { got.append($0) }
        await waitUntil { got.count >= 3 }
        XCTAssertGreaterThanOrEqual(got.count, 3)
        link.stopMeter()
        try? await Task.sleep(for: .milliseconds(100))
        let n = got.count
        try? await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(got.count, n, "tras stopMeter no llegan más lecturas")
    }

    /// Barrido completo: piso a 1 MHz de la baliza, vuelta a su frecuencia y lecturas válidas o no según la pose.
    func testSweepMeasuresTheFloorAndAppliesTheValidityRules() async {
        let link = makeLink()
        await link.connect(hash: nil)
        let sweep = BeaconSweep(site: BeaconSite(name: "B", latitude: 0, longitude: 0))
        var accuracy = 5.0
        await sweep.start(link: link) { BeaconPose(heading: 37, headingAccuracy: accuracy, pitch: 2) }

        XCTAssertEqual(sweep.phase, .metering)
        XCTAssertEqual(sweep.floor ?? 0, -99, accuracy: 2)
        XCTAssertEqual(link.freq, "914.000")
        await waitUntil { sweep.readings.count >= 3 }
        XCTAssertTrue(sweep.readings.allSatisfy(\.valid))
        XCTAssertNotNil(sweep.peak)
        XCTAssertEqual(sweep.readings.first?.pitch, 2)

        accuracy = 30                                   // brújula imprecisa: no cuentan
        let before = sweep.readings.count
        await waitUntil { sweep.readings.count >= before + 3 }
        XCTAssertFalse(sweep.readings.suffix(2).contains(where: \.valid))
        XCTAssertTrue(sweep.warnings.contains { $0.hasPrefix("Brújula imprecisa") })

        sweep.pause(link: link)
        XCTAssertEqual(sweep.phase, .paused)
        sweep.reset()
        XCTAssertTrue(sweep.readings.isEmpty)
        XCTAssertNil(sweep.peak)
        XCTAssertNotNil(sweep.floor, "Nuevo barrido conserva el piso")
    }

    func testReadingsWithForeignTrafficAreInvalid() {
        let sweep = BeaconSweep(site: BeaconSite(name: "B", latitude: 0, longitude: 0))
        let pose = BeaconPose(heading: 10, headingAccuracy: 5, pitch: nil)
        // Sin piso todavía nada es válido (no se sabe si se oye la baliza).
        sweep.add(MeasResult(n: 64, kept: 64, mean: -70, sd: 0.5, median: -70, min: -71, max: -69), pose: pose)
        XCTAssertFalse(sweep.readings[0].valid)
        XCTAssertEqual(sweep.dirty, 0)
        sweep.add(MeasResult(n: 64, kept: 36, mean: -70, sd: 0.5, median: -70, min: -71, max: -69), pose: pose)
        XCTAssertEqual(sweep.dirty, 1)
        XCTAssertTrue(sweep.warnings.contains { $0.hasPrefix("Tráfico ajeno") })
    }

    func testFloorFrequencyAvoidsBandEdgeAndMeshChannel() {
        XCTAssertEqual(BeaconSite.floorFreq(for: "914.000"), "913.000")
        XCTAssertEqual(BeaconSite.floorFreq(for: "902.500"), "903.500")     // −1 MHz se sale de la banda
        XCTAssertEqual(BeaconSite.floorFreq(for: "916.800"), "917.800")     // −1 MHz caería en 915.800
        XCTAssertEqual(BeaconSite.normalizedFreq("914"), "914.000")
        XCTAssertNil(BeaconSite.normalizedFreq("915.5"))                     // a < 1 MHz de MeshCore
        XCTAssertNil(BeaconSite.normalizedFreq("930"))
    }
}
