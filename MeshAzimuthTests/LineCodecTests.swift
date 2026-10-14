import XCTest
@testable import MeshAzimuth

/// Paridad con el lado C++ (Constitución IV, SC-006): el parser Swift se valida con los MISMOS
/// fixtures de líneas que el formateador de `tracecore` (copia verificada por tools/sync_fixtures.sh).
final class LineCodecTests: XCTestCase {

    // MARK: - Carga de fixtures (<línea>\t<json>)

    private struct Fixture {
        let line: String
        let json: [String: Any]
        let where_: String
    }

    private func load(_ name: String) throws -> [Fixture] {
        let bundle = Bundle(for: LineCodecTests.self)
        let dir = try XCTUnwrap(bundle.url(forResource: "lines", withExtension: nil), "falta la carpeta lines/ en el bundle de tests")
        let text = try String(contentsOf: dir.appendingPathComponent(name), encoding: .utf8)
        var out: [Fixture] = []
        for (i, raw) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            let line = String(raw).trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            let t = line.trimmingCharacters(in: .whitespaces)
            // Comentario: "#" solo o "# texto". "#HELLO", "#OK"... son líneas del protocolo.
            if t.isEmpty || t == "#" || t.hasPrefix("# ") || t.hasPrefix("#\t") { continue }
            guard let tab = line.firstIndex(of: "\t") else {
                XCTFail("\(name):\(i + 1): fixture sin expectativa"); continue
            }
            let json = try JSONSerialization.jsonObject(with: Data(line[line.index(after: tab)...].utf8)) as? [String: Any]
            out.append(Fixture(line: String(line[..<tab]), json: try XCTUnwrap(json), where_: "\(name):\(i + 1)"))
        }
        return out
    }

    // MARK: - Fixtures de eventos

    func testPingFixturesParseToTheExpectedResult() throws {
        let fx = try load("events_p.txt")
        XCTAssertGreaterThanOrEqual(fx.count, 7)
        for f in fx {
            let j = f.json
            let want = PingResult(seq: UInt32(j.int("seq")!), tag: j["tag"] as! String,
                                  status: PingResult.Status(rawValue: j["status"] as! String)!,
                                  rttMs: j.int("rtt_ms").map { UInt32($0) }, snrUp: j.dbl("snr_up"),
                                  snrDn: j.dbl("snr_dn"), rssiDn: j.dbl("rssi_dn"), nResp: UInt8(j.int("n_resp")!))
            XCTAssertEqual(LineCodec.parse(f.line), .ping(want), f.where_)
        }
    }

    func testSummaryFixturesParseToTheExpectedSummary() throws {
        let fx = try load("events_s.txt")
        XCTAssertGreaterThanOrEqual(fx.count, 7)
        for f in fx {
            let j = f.json
            let want = BurstSummary(n: j.int("n")!, ok: j.int("ok")!, lossPct: j.int("loss_pct"),
                                    medSnrUp: j.dbl("med_snr_up"), medSnrDn: j.dbl("med_snr_dn"),
                                    medRssiDn: j.dbl("med_rssi_dn"), busy: j.int("busy")!)
            XCTAssertEqual(LineCodec.parse(f.line), .summary(want), f.where_)
        }
    }

    func testRawFixturesParseToTheExpectedFrame() throws {
        let fx = try load("events_r.txt")
        XCTAssertGreaterThanOrEqual(fx.count, 5)
        for f in fx {
            let j = f.json
            var hex = j["hex"] as! String
            if hex.hasSuffix("..") { hex.removeLast(2) }
            let want = RawFrame(tMs: UInt32(j.int("t_ms")!), rssi: j.dbl("rssi")!, snr: j.dbl("snr")!,
                                hex: hex, truncated: (j["truncated"] as? Bool) ?? false)
            XCTAssertEqual(LineCodec.parse(f.line), .raw(want), f.where_)
        }
    }

    func testInfoFixturesParseToTheExpectedEvent() throws {
        let fx = try load("info.txt")
        XCTAssertGreaterThanOrEqual(fx.count, 20)
        for f in fx {
            let j = f.json
            let want: PingerEvent
            switch j["type"] as! String {
            case "HELLO":
                want = .hello(fw: j["fw"] as! String, proto: j.int("proto")!, radio: j["radio"] as! String, id: j["id"] as! String)
            case "CFG":
                want = .cfg(j.filter { $0.key != "type" }.mapValues { v in
                    (v as? String) ?? String((v as! NSNumber).intValue)   // números del JSON como texto
                })
            case "OK":
                want = .ok((j["text"] as? String) ?? "\(j["key"] as! String)=\(j["value"] as! String)")
            case "WARN":
                want = .warn(code: j["code"] as! String, detail: j["detail"] as? String)
            case "ERR":
                want = .error(code: j["code"] as! String, detail: j["detail"] as? String)
            default:
                XCTFail("tipo desconocido en \(f.where_)"); continue
            }
            XCTAssertEqual(LineCodec.parse(f.line), want, f.where_)
        }
    }

    func testEveryCommandReplyIsRecognisedWithItsErrorCode() throws {
        let fx = try load("commands.txt")
        XCTAssertGreaterThanOrEqual(fx.count, 40)
        for f in fx {
            for key in ["reply", "reply2"] {
                guard let reply = f.json[key] as? String else { continue }
                let ev = LineCodec.parse(reply)
                switch ev {
                case .unknown: XCTFail("\(f.where_): '\(reply)' no se reconoce")
                case .error(let code, _):
                    if let want = f.json["error"] as? String { XCTAssertEqual(code, want, f.where_) }
                default: break
                }
            }
        }
    }

    // MARK: - Prefijos desconocidos y líneas mal formadas

    func testUnknownPrefixesAreKeptAsUnknown() {
        for line in ["X,1,2", "#FOO bar", "hello world", "", "?", "p,1,00000001,ok,1,+1.00,+1.00,-50.0,1"] {
            XCTAssertEqual(LineCodec.parse(line), .unknown(line), "'\(line)'")
        }
    }

    func testMalformedKnownLinesBecomeUnknown() {
        let bad = [
            "P,1,2",                                           // pocos campos
            "P,x,00000001,ok,1,+1.00,+1.00,-50.0,1",           // seq no numérico
            "P,1,ZZZZZZZZ,ok,1,+1.00,+1.00,-50.0,1",           // tag no hex
            "P,1,0000001,ok,1,+1.00,+1.00,-50.0,1",            // tag de 7 dígitos
            "P,1,00000001,maybe,1,+1.00,+1.00,-50.0,1",        // status inválido
            "P,1,00000001,ok,,,,,1",                           // ok sin medidas
            "P,1,00000001,ok,1,nan,+1.00,-50.0,1",             // NaN no es un número válido
            "P,1,00000001,ok,1,+1.00,+1.00,-50.0,300",         // n_resp fuera de UInt8
            "S,5,5",                                           // resumen truncado
            "S,a,5,0,,,,0",
            "R,1,2",
            "R,1,-1.0,+1.0,ZZ",                                // hex inválido
            "R,1,-1.0,+1.0,ABC",                               // hex de longitud impar
            "#HELLO fw=0.1.0",                                 // faltan campos
            "#HELLO fw=0.1.0 proto=x radio=SX1262 id=ABCDEF",
            "!ERR",
            "#OK",
        ]
        for line in bad { XCTAssertEqual(LineCodec.parse(line), .unknown(line), "'\(line)'") }
    }

    // MARK: - Compatibilidad hacia adelante (contrato, regla 4)

    func testExtraTrailingFieldsAreTolerated() {
        guard case .ping(let p) = LineCodec.parse("P,7,0000000A,ok,300,+9.25,+8.50,-35.0,1,extra") else {
            return XCTFail("un campo añadido al final de P debe tolerarse")
        }
        XCTAssertEqual(p.seq, 7)
        guard case .hello(_, let proto, _, _) = LineCodec.parse("#HELLO fw=0.2.0 proto=1 radio=SX1262 id=ABCDEF new=1") else {
            return XCTFail("claves nuevas en #HELLO deben tolerarse")
        }
        XCTAssertEqual(proto, 1)
    }

    func testSummaryWithoutBusyFieldDefaultsToZero() {
        guard case .summary(let s) = LineCodec.parse("S,5,5,0,-6.25,-4.50,-108.0") else { return XCTFail() }
        XCTAssertEqual(s.busy, 0)
    }

    func testCarriageReturnIsIgnored() {
        XCTAssertEqual(LineCodec.parse("#OK go\r"), .ok("go"))
    }

    // MARK: - LineAssembler (reensamblado por \n)

    func testReassemblesALineSplitAcrossNotifications() {
        var a = LineAssembler()
        XCTAssertEqual(a.feed("P,1,AB"), [])
        XCTAssertEqual(a.feed("CD,ok\nP,2,EF"), ["P,1,ABCD,ok"])
        XCTAssertEqual(a.feed("\n"), ["P,2,EF"])
    }

    func testSeveralLinesInOneNotification() {
        var a = LineAssembler()
        XCTAssertEqual(a.feed("#OK go\nP,1,x\n#OK stop\n"), ["#OK go", "P,1,x", "#OK stop"])
    }

    func testCRLFAndEmptyLines() {
        var a = LineAssembler()
        XCTAssertEqual(a.feed("A\r\n\r\n\nB\r\n"), ["A", "B"])
    }

    func testDataInputAndMultiByteCharacterSplitAcrossChunks() {
        var a = LineAssembler()
        let bytes = Array("café\n".utf8)             // "é" ocupa 2 bytes
        XCTAssertEqual(a.feed(Data(bytes[0..<4])), []) // corta en medio de la "é"
        XCTAssertEqual(a.feed(Data(bytes[4...])), ["café"])
    }

    func testLineAtTheLimitIsAcceptedAndLongerIsDiscarded() {
        var a = LineAssembler()
        let ok = String(repeating: "a", count: 159)       // 159 + '\n' = 160 B, el máximo
        XCTAssertEqual(a.feed(ok + "\n"), [ok])
        XCTAssertEqual(a.overflowCount, 0)

        let tooLong = String(repeating: "b", count: 160)
        XCTAssertEqual(a.feed(tooLong + "\nOK\n"), ["OK"])  // se descarta la larga y se sigue
        XCTAssertEqual(a.overflowCount, 1)
    }

    func testOverflowAcrossChunksResynchronisesAtNextNewline() {
        var a = LineAssembler()
        XCTAssertEqual(a.feed(String(repeating: "x", count: 100)), [])
        XCTAssertEqual(a.feed(String(repeating: "x", count: 100)), [])      // ya pasó del tope: descartando
        XCTAssertEqual(a.feed(String(repeating: "x", count: 50) + "\nnext\n"), ["next"])
        XCTAssertEqual(a.overflowCount, 1)
    }
}

// MARK: - Ayudas de JSON

private extension Dictionary where Key == String, Value == Any {
    func int(_ k: String) -> Int? { (self[k] as? NSNumber)?.intValue }
    func dbl(_ k: String) -> Double? { (self[k] as? NSNumber)?.doubleValue }
}
