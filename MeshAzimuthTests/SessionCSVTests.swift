import XCTest
@testable import MeshAzimuth

/// Contrato de exportación (specs/003.../contracts/session-csv.md).
final class SessionCSVTests: XCTestCase {
    private let utc5 = TimeZone(secondsFromGMT: -5 * 3600)!

    private func date(_ iso: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso)!
    }

    private func sample(_ idx: Int, ok: Bool = true, unstable: Bool = false, invalid: Bool = false) -> Sample {
        let r = PingResult(seq: UInt32(idx), tag: "AABBCCDD", status: ok ? .ok : .timeout, rttMs: ok ? 300 : nil,
                           snrUp: ok ? 9.25 : nil, snrDn: ok ? -0.5 : nil, rssiDn: ok ? -108 : nil, nResp: ok ? 1 : 0)
        return Sample(readingIndex: idx > 2 ? 2 : 1, tTx: date("2026-10-15T07:12:03.215-05:00"), tRx: date("2026-10-15T07:12:04.600-05:00"),
                      headingTx: 61.04, headingRx: 61.5, headingAccuracy: 5, latitude: 3.4516, longitude: -76.532, altitude: 1012.34,
                      hAccuracy: 4.8, targetBearing: 62.75, delta: 1.7, unstable: unstable, invalid: invalid, result: r)
    }

    private func session(name: String = "Cerro Pico", samples: [Sample]) -> Session {
        Session(repeater: Repeater(name: name, latitude: 3.5, longitude: -76.6, hashPrefix: "4F"),
                started: date("2026-10-15T07:12:03.215-05:00"), txpDbm: 22, fw: "0.1.0", proto: 1, samples: samples)
    }

    /// Divide una línea CSV respetando comillas (solo para el test).
    private func fields(_ line: String) -> [String] {
        var out: [String] = [], cur = "", inQuotes = false
        var it = line.makeIterator()
        while let c = it.next() {
            if c == "\"" {
                if inQuotes, let n = it.next() {
                    if n == "\"" { cur.append("\"") } else { inQuotes = false; if n == "," { out.append(cur); cur = "" } else { cur.append(n) } }
                } else { inQuotes = true }
            } else if c == "," && !inQuotes { out.append(cur); cur = "" } else { cur.append(c) }
        }
        out.append(cur)
        return out
    }

    func testHeaderIsExactlyTheContract() {
        let expected = "session_id,repeater_name,repeater_hash,repeater_lat,repeater_lon,reading_idx,sample_idx,t_tx_iso,t_rx_iso,lat,lon,alt_m,h_acc_m,target_bearing_deg,heading_tx_deg,heading_rx_deg,heading_acc_deg,delta_deg,unstable,invalid,seq,tag,status,rtt_ms,snr_up_db,snr_dn_db,rssi_dn_dbm,n_resp,txp_dbm,fw,proto"
        XCTAssertEqual(SessionCSV.header, expected)
        let csv = SessionCSV.make(session(samples: []), timeZone: utc5)
        XCTAssertEqual(csv, expected + "\r\n")
        XCTAssertEqual(SessionCSV.header.split(separator: ",").count, 31)
    }

    func testOneRowPerSampleWithTheRightFormats() {
        let csv = SessionCSV.make(session(samples: [sample(1), sample(2, unstable: true), sample(3, invalid: true)]), timeZone: utc5)
        let lines = csv.components(separatedBy: "\r\n").filter { !$0.isEmpty }
        XCTAssertEqual(lines.count, 4)                                   // cabecera + 3 muestras
        for l in lines { XCTAssertEqual(fields(l).count, 31, l) }

        let f = fields(lines[1])
        XCTAssertEqual(f[2], "4F")
        XCTAssertEqual(f[5], "1"); XCTAssertEqual(f[6], "1")             // reading_idx, sample_idx (1-based)
        XCTAssertEqual(f[7], "2026-10-15T07:12:03.215-05:00")            // ms y offset
        XCTAssertEqual(f[8], "2026-10-15T07:12:04.600-05:00")
        XCTAssertEqual(f[11], "1012.3")                                  // alt, 1 decimal
        XCTAssertEqual(f[14], "61.0")                                    // *_deg con 1 decimal
        XCTAssertEqual(f[17], "1.7")
        XCTAssertEqual(f[18], "0"); XCTAssertEqual(f[19], "0")           // unstable, invalid
        XCTAssertEqual(f[22], "ok")
        XCTAssertEqual(f[24], "+9.25"); XCTAssertEqual(f[25], "-0.50"); XCTAssertEqual(f[26], "-108.0")   // igual que la línea P,
        XCTAssertEqual(f[28], "22"); XCTAssertEqual(f[29], "0.1.0"); XCTAssertEqual(f[30], "1")

        XCTAssertEqual(fields(lines[2])[18], "1")                        // unstable
        XCTAssertEqual(fields(lines[3])[19], "1")                        // invalid
        XCTAssertEqual(fields(lines[3])[5], "2"); XCTAssertEqual(fields(lines[3])[6], "1")   // la 3.ª muestra abre la lectura 2
    }

    func testTimeoutRowsLeaveMeasurementsEmpty() {
        let csv = SessionCSV.make(session(samples: [sample(1, ok: false)]), timeZone: utc5)
        let f = fields(csv.components(separatedBy: "\r\n")[1])
        XCTAssertEqual(f[22], "timeout")
        XCTAssertEqual([f[23], f[24], f[25], f[26]], ["", "", "", ""])   // rtt, snr_up, snr_dn, rssi
        XCTAssertEqual(f[27], "0")                                       // n_resp
    }

    func testRFC4180Escaping() {
        XCTAssertEqual(SessionCSV.escape("plano"), "plano")
        XCTAssertEqual(SessionCSV.escape("Cerro, Cali"), "\"Cerro, Cali\"")
        XCTAssertEqual(SessionCSV.escape("El \"Pico\""), "\"El \"\"Pico\"\"\"")
        XCTAssertEqual(SessionCSV.escape("a\nb"), "\"a\nb\"")

        let csv = SessionCSV.make(session(name: "Cerro \"El Pico\", Cali", samples: [sample(1)]), timeZone: utc5)
        let f = fields(csv.components(separatedBy: "\r\n")[1])
        XCTAssertEqual(f.count, 31)                                      // la coma y las comillas no desplazan columnas
        XCTAssertEqual(f[1], "Cerro \"El Pico\", Cali")
    }

    func testFileNameIsSafeAndTimestamped() {
        let s = session(name: "Cerro El Pico/Cali ñ", samples: [])
        XCTAssertEqual(SessionCSV.fileName(for: s, timeZone: utc5), "meshazimuth_Cerro_El_Pico_Cali___20261015-071203.csv")
    }
}
