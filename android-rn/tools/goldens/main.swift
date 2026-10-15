// Vectores dorados (specs/004 R-13, contracts/format-semantics.md).
// Se compila JUNTO a los archivos de la referencia SIN modificarlos (ver run.sh) y escribe JSON por stdout.
// Los tests de Jest comparan contra ese JSON: si el contrato y el dorado discrepan, manda el dorado.
//
// Los doubles viajan como patrón de bits en hexadecimal ("0x3ff0000000000000") para no depender de cómo cada
// lado imprime números; los textos viajan tal cual.
import CoreLocation
import Foundation

func step(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }
func bits(_ x: Double) -> String { "0x" + String(x.bitPattern, radix: 16) }
func bitsOpt(_ x: Double?) -> Any { x.map(bits) ?? NSNull() }
func doubleFromDescription(_ s: String) -> Double { Double(s)! }

let localeArg = CommandLine.arguments.first { $0.hasPrefix("--locale=") }.map { String($0.dropFirst(9)) }
var out: [String: Any] = [:]

actor Collector {
    var lines: [String] = []
    func add(_ l: String) { lines.append(l) }
    func take() -> [String] { defer { lines = [] }; return lines }
    func count(prefix: String) -> Int { lines.filter { $0.hasPrefix(prefix) }.count }
}
func run(seed: UInt64, heading: Double?, target: Double?, pings: Int) async -> [String: Any] {
    var cfg = SimulatedPinger.Config(); cfg.seed = seed; cfg.delayScale = 0.01
    let sim = SimulatedPinger(config: cfg, heading: { heading }, targetBearing: { target })
    let col = Collector()
    let reader = Task { for await l in sim.lines { await col.add(l) } }
    try? await sim.open()
    var replies: [[String: Any]] = []
    let cmds = ["HELLO", "hello", "CFG?", "STOP", "MON ON", "mon off", "MON", "PING", "SET hash=zz", "SET hash=4f", "SET hash", "SET  hash=4F", "  set   rate=999 ", "SET rate=1000",
                "SET rate=+2000", "SET rate=x", "SET freq=900.1", "set TXP=22", "SET foo=1", "SET =1", "SET a=b=c", "BOGUS", "", "   ", "CFG?"]
    for c in cmds {
        try? await sim.send(c)
        try? await Task.sleep(for: .milliseconds(40))
        replies.append(["cmd": c, "lines": await col.take()])
    }
    _ = await col.take()
    var p: [String] = []
    var warns = 0
    for _ in 0..<pings {
        try? await sim.send("PING")
        while await col.count(prefix: "P,") == 0 { try? await Task.sleep(for: .milliseconds(3)) }
        for l in await col.take() { if l.hasPrefix("P,") { p.append(l) } else if l.hasPrefix("#WARN") { warns += 1 } }
    }
    sim.close(); reader.cancel()
    return ["replies": replies, "pings": p, "warns": warns]
}


// MARK: - SplitMix64 local para generar entradas de prueba reproducibles (la de SimulatedPinger.swift es la que se prueba)
var inputRng = SplitMix64(seed: 0xC0FFEE)
func randomDouble(scale: Double) -> Double { (inputRng.uniform() * 2 - 1) * scale }

if let localeId = localeArg {
    // ---- Secciones que dependen de la región del proceso (se ejecuta con -AppleLocale <id>) ----
    var section: [String: Any] = [:]

    // FS-10 ByteCountFormatter(.file)
    let f = ByteCountFormatter()
    f.countStyle = .file
    let sizes: [Int64] = [0, 1, 2, 10, 999, 1000, 1001, 1499, 1500, 1999, 2000, 9_949, 9_950, 10_000, 99_499, 99_500, 999_999,
                          1_000_000, 1_049_999, 1_050_000, 9_999_999, 12_345_678, 99_949_999, 100_000_000, 499_999_999, 500_000_000,
                          999_999_999, 1_000_000_000, 1_234_567_890, 12_345_678_901,
                          2_500, 3_500, 4_500, 5_500, 1_250_000, 1_350_000, 2_250_000, 2_350_000, 1_005_000, 12_250_000, 12_350_000, 99_950_000, 99_949_000,
                          1_005_000_000, 1_015_000_000, 1_025_000_000, 999_500_000, 999_499_999, 999_950_000_000, 1_000_000_000_000, 1_234_567_890_123,
                          12_345_678_901_234, 1_000_000_000_000_000, 2_000_000_000_000_000_000]
    section["byteCount"] = sizes.map { ["bytes": "\($0)", "text": f.string(fromByteCount: $0)] }

    // FS-11 búsqueda y orden
    let contains: [(String, String)] = [
        ("Cerro Pico", "pico"), ("Cerro Pico", "PICO"), ("Cúcuta", "cucuta"), ("Cúcuta", "CÚC"), ("Cucuta", "cúc"),
        ("Ñandú", "ñand"), ("Ñandú", "nand"), ("straße", "STRASSE"), ("STRASSE", "straße"), ("Cali", "Cali"), ("Cali", "li"),
        ("Cali", "cx"), ("ca\u{0301}li", "CÁ"), ("cáli", "ca\u{0301}"), ("İstanbul", "istanbul"), ("istanbul", "İSTANBUL"),
        ("Repetidor 1", "repetidor 1"), ("a b", "a  b"), ("Cali", ""),
    ]
    section["contains"] = contains.map { ["hay": $0.0, "needle": $0.1, "result": $0.0.localizedCaseInsensitiveContains($0.1)] }
    let compares: [(String, String)] = [
        ("a", "B"), ("B", "a"), ("a", "a"), ("A", "a"), ("ñ", "o"), ("n", "ñ"), ("ñ", "n"), ("Z", "a"), ("á", "a"), ("A", "á"),
        ("a", "á"), ("Cali", "cali"), ("cali", "Cali"), ("Pico 2", "Pico 10"), ("ab", "a b"), ("é", "f"), ("e\u{0301}", "é"),
        ("Zeta", "ñandú"), ("ñandú", "Zeta"), ("ch", "d"), ("ll", "m"),
    ]
    section["compare"] = compares.map { ["a": $0.0, "b": $0.1, "result": $0.0.localizedCaseInsensitiveCompare($0.1).rawValue] }
    let names = ["Pico", "pico", "Ñandú", "Zeta", "nube", "Cúcuta", "cucuta", "Álamo", "alamo", "Ñu", "Nu", "Oso", "ábaco", "Abaco", "10", "2", "Repetidor 10", "Repetidor 2", "Repetidor 1"]
    section["sorted"] = names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    section["sortInput"] = names
    section["localeIdentifier"] = Locale.current.identifier
    out = ["locale": [localeId: section]]
} else {
    // MARK: - FS-01 formatC
    step("FS-01 formatC")

    var formatC: [String: Any] = [:]
    let table: [(String, Double)] = [
        ("%.2f", 0.125), ("%.2f", 0.375), ("%.2f", 0.625), ("%.2f", -0.125), ("%.1f", 61.25), ("%.1f", -61.25), ("%.1f", 0.25), ("%.1f", 0.35),
        ("%.0f", 2.5), ("%.0f", -2.5), ("%.0f", 3.5), ("%.0f", 0.5), ("%.0f", 1.5), ("%.0f", -0.4), ("%.0f", -0.5), ("%+.2f", -0.0), ("%+.2f", 0.0),
        ("%+.1f", -0.0), ("%+.1f", 0.0), ("%.2f", -0.0), ("%.1f", -0.04), ("%+.1f", -0.04), ("%+.2f", -0.004), ("%.6f", 3.4516), ("%.6f", -76.532),
        ("%.6f", 0.0000005), ("%.6f", 0.0000015), ("%.6f", 6.8403), ("%.6f", -73.2265), ("%.3f", 1.0005), ("%.3f", 2.0015), ("%.4f", 0.00005),
        ("%.2f", 1e15), ("%.1f", 123456789.25), ("%.0f", 1e22), ("%.2f", 5e-324), ("%+.2f", 1.7976931348623157e308),
        ("%.1f", 9.95), ("%.1f", 9.949999999999999), ("%.2f", 1.005), ("%.2f", 2.675), ("%.2f", 1.115), ("%.0f", 0.49999999999999994),
        ("%+.2f", 9.25), ("%+.2f", -0.5), ("%+.1f", -108.0), ("%.0f", 1012.34), ("%.1f", 1012.34), ("%.0f", 306669.4),
    ]
    formatC["table"] = table.map { ["spec": $0.0, "value": bits($0.1), "out": String(format: $0.0, $0.1)] }
    formatC["quartersPlus2"] = (-128...127).map { String(format: "%+.2f", Double($0) / 4) }       // [-32, 31.75]
    formatC["tenthsPlus1"] = (-1300...0).map { String(format: "%+.1f", Double($0) / 10) }          // [-130.0, 0.0]
    formatC["tenths1"] = (-1300...0).map { String(format: "%.1f", Double($0) / 10) }
    var random: [[String: String]] = []
    for (spec, scale) in [("%.1f", 1000.0), ("%.2f", 1000.0), ("%.6f", 180.0), ("%.0f", 1_000_000.0), ("%+.2f", 40.0), ("%+.1f", 130.0)] {
        for _ in 0..<300 {
            let x = randomDouble(scale: scale)
            random.append(["spec": spec, "value": bits(x), "out": String(format: spec, x)])
        }
    }
    formatC["random"] = random
    formatC["hex"] = [0, 1, 255, 0xABCDEF, 0x78563412, 0xFFFFFFFF].map { ["value": "\($0)", "out": String(format: "%08X", UInt32($0))] }
    formatC["int"] = [0, 7, -7, 1012, 2147483647].map { ["value": "\($0)", "out": String(format: "%d", $0)] }
    out["formatC"] = formatC

    // MARK: - FS-02 Double(String), FS-03 Int(String)
    step("FS-02 Double(String), FS-03 Int(String)")

    let doubles = ["", " 5", "5 ", "+3.25", "-6.00", ".5", "5.", "1e3", "1E-3", "nan", "NaN", "inf", "-Infinity", "0x1p3", "0x10", "1_000", "٣", "1,5",
                   "+", "-", ".", "e5", "1e", "1e+", "--1", "+-1", "0x", "0x.8", "0x1.8p1", "0X1P-2", "INF", "+inf", "-nan", "nan(0x1)", "1e999", "-1e999",
                   "1e-999", "0.1", "00012", "1.7976931348623157e308", "4.9e-324", "123456789012345678901234567890", "\t5", "5\n", "5\u{00A0}", "5abc", "0b1", "1d3", "1f"]
    out["parseDouble"] = doubles.map { s -> [String: Any] in ["in": s, "out": Double(s).map(bits) ?? "nil"] }
    let ints = ["", "+5", "-5", " 5", "5 ", "0", "-0", "+0", "9223372036854775807", "9223372036854775808", "-9223372036854775808", "-9223372036854775809",
                "+", "-", "٣", "1_0", "5.0", "05", "1e3", "0x10", "٣4"]
    out["parseInt"] = ints.map { s -> [String: Any] in ["in": s, "out": Int(s).map { "\($0)" } ?? "nil"] }

    // MARK: - FS-04 redondeo
    step("FS-04 redondeo")

    let rounds: [Double] = [-110.5, 110.5, 2.5, -2.5, 0.5, -0.5, -0.4, 0.4, 1.4999999999999998, 33.333333333333336, 12.5, -0.0, 1e300, 4503599627370497.5]
    out["rounded"] = rounds.map { ["in": bits($0), "away": bits($0.rounded()), "zero": bits($0.rounded(.towardZero))] }

    // MARK: - FS-09 String(Double)
    step("FS-09 String(Double)")

    var descr: [[String: String]] = [0, -0.0, -73.0, 6.8403, 0.00001, 1012.0, 1e16, 1.5e-5, 123456789.123, 1e15, 9999999999999998, 0.0001, 0.00009999, 1e-4,
                                      100, 1e21, 1.0e22, 0.1, 0.3, 1.0 / 3.0, 5e-324, 1.7976931348623157e308, -1e-7, 12345678901234567890.0, 2.5e-5, 4.35, 306.67]
        .map { ["value": bits($0), "out": "\($0)"] }
    for scaleExp in stride(from: -12, through: 22, by: 1) {
        for _ in 0..<12 {
            let x = randomDouble(scale: pow(10, Double(scaleExp)))
            descr.append(["value": bits(x), "out": "\(x)"])
        }
    }
    out["describe"] = descr

    // MARK: - Geo / AimInfo
    step("Geo / AimInfo")

    let pts: [(Double, Double)] = [(0, 0), (3.4516, -76.5320), (4.7110, -74.0721), (6.8403, -73.2265), (90, 0), (-90, 0), (0, 180), (0, -180), (45, 179.9), (-45, -179.9),
                                   (89.9999, 10), (-33.8688, 151.2093), (51.5074, -0.1278), (35.6762, 139.6503), (3.4516, -76.5320), (3.45161, -76.53201), (10, 20), (-10, -20), (60, 120), (-60, -120)]
    var geo: [[String: Any]] = []
    for a in pts {
        for b in pts {
            let ca = CLLocationCoordinate2D(latitude: a.0, longitude: a.1), cb = CLLocationCoordinate2D(latitude: b.0, longitude: b.1)
            geo.append(["a": [a.0, a.1], "b": [b.0, b.1], "bearing": bits(Geo.bearing(from: ca, to: cb)), "distance": bits(Geo.distance(from: ca, to: cb))])
        }
    }
    out["geoPairs"] = geo
    let elevCases: [(Double, Double, Double)] = [(0, 0, 0), (1, 0, 100), (1.0001, 0, 100), (500, 1000, 1012), (306_669, 1000, 1012), (306_669, 1000, 3000), (50_000, 2000, 1000), (200_000, 0, 0), (10, 5, 5)]
    out["elevation"] = elevCases.map { ["d": bits($0.0), "h1": bits($0.1), "h2": bits($0.2), "out": bits(Geo.elevation(distance: $0.0, ownAltitude: $0.1, targetAltitude: $0.2))] }
    let angles: [Double] = [-1e-18, 0, 360, 360.0000000001, 359.99999999999994, -360, -90, 720.5, -720.5, 1e6, -1e6, 180, -180, 540, 12.5]
    out["normalize"] = angles.map { ["in": bits($0), "out": bits(Geo.normalize($0))] }
    var deltas: [[String: String]] = []
    for t in [0.0, 10, 180, 181, 270, 359.9, 90] { for c in [0.0, 350, 180, 1, 359, 90, 270, 0.1] { deltas.append(["t": bits(t), "c": bits(c), "out": bits(Geo.signedDelta(target: t, current: c))]) } }
    out["signedDelta"] = deltas
    out["cardinal"] = stride(from: -30.0, through: 400.0, by: 2.5).map { ["in": bits($0), "out": Geo.cardinal($0)] }
    let means: [[Double]] = [[], [359, 1], [358, 2, 0], [350, 10, 30], [10, 20, 30], [90], [270, 270], [0, 180], [0.0001, 359.9999], [180, 181], [100, 100 - 179, 279], [45, 135, 225, 315]]
    out["circularMean"] = means.map { ["in": $0.map(bits), "out": bitsOpt(Geo.circularMean($0))] }
    let medians: [[Double]] = [[], [3, 1, 2], [1, 2, 3, 4], [5], [-4.5, -6.25], [9, -3, 4, 4, 100], [-6.25, -4.5, -3, -8]]
    out["median"] = medians.map { ["in": $0.map(bits), "out": bitsOpt(Geo.median($0))] }
    out["isAligned"] = [(4.0, 3.0, false), (2.9, 3, false), (4.5, 3, true), (5.5, 3, true), (5.0, 3, true), (3.0, 3, false)]
        .map { ["delta": bits($0.0), "tol": bits($0.1), "was": $0.2, "out": Geo.isAligned(delta: $0.0, tolerance: $0.1, wasAligned: $0.2)] }

    let me = CLLocation(coordinate: .init(latitude: 3.4516, longitude: -76.532), altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date())
    let meNoV = CLLocation(coordinate: .init(latitude: 3.4516, longitude: -76.532), altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: Date())
    let rep = Repeater(name: "R", latitude: 4.711, longitude: -74.0721, altitude: 2600)
    let repNoAlt = Repeater(name: "R", latitude: 4.711, longitude: -74.0721)
    let near = Repeater(name: "N", latitude: 3.4520, longitude: -76.5320, altitude: 1005)
    var aim: [[String: Any]] = []
    for (label, loc, r, h) in [("full", me, rep, Optional(40.0)), ("noHeading", me, rep, nil), ("noAlt", me, repNoAlt, 40.0), ("noVertical", meNoV, rep, 40.0), ("near", me, near, 62.0)] {
        let info = AimInfo(me: loc, repeater: r, heading: h)!
        aim.append(["case": label, "bearing": bits(info.bearing), "distance": bits(info.distance), "elevation": bitsOpt(info.elevation), "delta": bitsOpt(info.delta), "text": info.distanceText])
    }
    out["aimInfo"] = aim

    // MARK: - SplitMix64, yagiGain
    step("SplitMix64, yagiGain")

    var rng = SplitMix64(seed: 1)
    out["splitmix64_next"] = (0..<1000).map { _ in "\(rng.next())" }
    var rngU = SplitMix64(seed: 1)
    out["splitmix64_uniform"] = (0..<100).map { _ in bits(rngU.uniform()) }
    var rngG = SplitMix64(seed: 1)
    out["splitmix64_gaussian"] = (0..<100).map { _ in bits(rngG.gaussian()) }
    var rngSeed = SplitMix64(seed: 0xFFFF_FFFF_FFFF_FFFF)
    out["splitmix64_maxseed"] = (0..<10).map { _ in "\(rngSeed.next())" }
    var yg: [[String: String]] = []
    for (n, fb) in [(8.0, 12.0), (4.0, 20.0), (8.0, 6.0)] {
        for d in stride(from: -180.0, through: 180.0, by: 5.0) { yg.append(["d": bits(d), "n": bits(n), "fb": bits(fb), "out": bits(SimulatedPinger.yagiGain(deltaDeg: d, n: n, fbDB: fb))]) }
    }
    out["yagiGain"] = yg

    // MARK: - Repetidores: hash, merge, JSON
    step("Repetidores: hash, merge, JSON")

    let hashes = ["a1", "A1", " a1 ", "\ta1\t", "a", "a12", "", "gg", "ﬀ", "ß", "0F", "９９", "a\u{00A0}", "\u{00A0}f0", "a1\n", "A\u{0301}1", "ａ１"]
    out["hashPrefix"] = hashes.map { ["in": $0, "out": Repeater.normalizedHashPrefix($0) ?? NSNull()] as [String: Any] }

    func rp(_ id: String, _ name: String, _ lat: Double, _ lon: Double, _ alt: Double? = nil, _ hash: String? = nil) -> Repeater {
        Repeater(id: UUID(uuidString: id)!, name: name, latitude: lat, longitude: lon, altitude: alt, hashPrefix: hash)
    }
    let ids = (1...12).map { String(format: "00000000-0000-0000-0000-%012d", $0) }
    let existing = [rp(ids[0], "A", 1, 2), rp(ids[1], "B", 3, 4, 100, "4F")]
    let incoming = [rp(ids[0], "other", 9, 9), rp(ids[2], "A", 1, 2), rp(ids[3], "C", 5, 6), rp(ids[3], "C2", 7, 8), rp(ids[4], "", 1, 1), rp(ids[5], "D", 91, 0),
                    rp(ids[6], "E", 0, 181), rp(ids[7], "F", -90, 180), rp(ids[8], "C", 5, 6)]
    let store = RepeaterStore()
    store.repeaters = existing
    let merged = store.merge(incoming)
    out["merge"] = ["added": merged.added, "skipped": merged.skipped, "ids": store.repeaters.map(\.id.uuidString), "names": store.repeaters.map(\.name)]

    let jsonRepeaters: [Repeater] = [
        rp(ids[0], "pico de la vieja", 6.8403, -73.2265, 1012, "9A"), rp(ids[1], "sin opcionales", 0, 0), rp(ids[2], "num -0", -0.0, 1e-5), rp(ids[3], "grande", 1e16, 123456789.123),
        rp(ids[4], "enteros", -73, 45, 1012.5), rp(ids[5], "a/b", 0.1, 1e21), rp(ids[6], "ñ😀", 3.4516, -76.532), rp(ids[7], "q\"uote", 1, 1), rp(ids[8], "back\\slash", 1, 1),
        rp(ids[9], "ctl\t\n\r\u{01}\u{7f}\u{08}\u{0c}", 1, 1), rp(ids[10], "sep\u{2028}\u{2029}é", 1, 1), rp(ids[11], "x", 0.00001234, -0.0001),
    ]
    let pretty = JSONEncoder(); pretty.outputFormatting = [.prettyPrinted, .sortedKeys]
    let sorted = JSONEncoder(); sorted.outputFormatting = [.sortedKeys]
    out["jsonRepeaters"] = [
        "pretty": String(decoding: try! pretty.encode(jsonRepeaters), as: UTF8.self),
        "sorted": String(decoding: try! sorted.encode(jsonRepeaters), as: UTF8.self),
        "prettyEmpty": String(decoding: try! pretty.encode([Repeater]()), as: UTF8.self),
        "prettySingle": String(decoding: try! pretty.encode([jsonRepeaters[0]]), as: UTF8.self),
        "prettyNoOptional": String(decoding: try! pretty.encode([jsonRepeaters[1]]), as: UTF8.self),
    ]
    let decodeCases = [
        "[{\"id\":\"6f1c2d3e-0000-0000-0000-000000000001\",\"name\":\"x\",\"latitude\":1,\"longitude\":2}]",
        "[{\"id\":\"6F1C2D3E-0000-0000-0000-000000000001\",\"name\":\"x\",\"latitude\":1,\"longitude\":2,\"altitude\":null,\"hashPrefix\":null,\"extra\":[1]}]",
        "[{\"id\":\"nope\",\"name\":\"x\",\"latitude\":1,\"longitude\":2}]",
        "[{\"name\":\"x\",\"latitude\":1,\"longitude\":2}]",
        "[{\"id\":\"6F1C2D3E-0000-0000-0000-000000000001\",\"name\":\"x\",\"latitude\":\"1\",\"longitude\":2}]",
        "[{\"id\":\"6F1C2D3E-0000-0000-0000-000000000001\",\"name\":1,\"latitude\":1,\"longitude\":2}]",
        "{}", "[]", "", "[1]", "[{\"id\":\"6F1C2D3E-0000-0000-0000-000000000001\",\"name\":\"x\",\"latitude\":1,\"longitude\":2},]",
        "[{\"id\":\"6F1C2D3E000000000000000000000001\",\"name\":\"x\",\"latitude\":1,\"longitude\":2}]",
        "[{\"id\":\"6F1C2D3E-0000-0000-0000-000000000001\",\"name\":\"x\",\"latitude\":1e2,\"longitude\":-0.0,\"altitude\":12}]",
    ]
    out["jsonRepeaterDecode"] = decodeCases.map { s -> [String: Any] in
        if let list = try? JSONDecoder().decode([Repeater].self, from: Data(s.utf8)) {
            return ["in": s, "ok": true, "out": String(decoding: try! sorted.encode(list), as: UTF8.self)]
        }
        return ["in": s, "ok": false]
    }
    let uuids = ["6f1c2d3e-0000-0000-0000-000000000001", "6F1C2D3E-0000-0000-0000-000000000001", "{6F1C2D3E-0000-0000-0000-000000000001}", "6F1C2D3E000000000000000000000001",
                 "6F1C2D3E-0000-0000-0000-00000000000", "6F1C2D3E-0000-0000-0000-00000000000G", " 6F1C2D3E-0000-0000-0000-000000000001", ""]
    out["uuid"] = uuids.map { ["in": $0, "out": UUID(uuidString: $0)?.uuidString ?? NSNull()] as [String: Any] }

    // MARK: - LineCodec: eventos como texto canónico
    step("LineCodec: eventos como texto canónico")

    func canon(_ e: PingerEvent) -> String {
        func d(_ x: Double?) -> String { x.map(bits) ?? "-" }
        switch e {
        case .hello(let fw, let proto, let radio, let id): return "hello|\(fw)|\(proto)|\(radio)|\(id)"
        case .cfg(let kv): return "cfg|" + kv.keys.sorted().map { "\($0)=\(kv[$0]!)" }.joined(separator: ";")
        case .ok(let t): return "ok|\(t)"
        case .warn(let c, let det): return "warn|\(c)|\(det ?? "-")"
        case .error(let c, let det): return "error|\(c)|\(det ?? "-")"
        case .ping(let r): return "ping|\(r.seq)|\(r.tag)|\(r.status.rawValue)|\(r.rttMs.map(String.init) ?? "-")|\(d(r.snrUp))|\(d(r.snrDn))|\(d(r.rssiDn))|\(r.nResp)"
        case .summary(let s): return "summary|\(s.n)|\(s.ok)|\(s.lossPct.map(String.init) ?? "-")|\(d(s.medSnrUp))|\(d(s.medSnrDn))|\(d(s.medRssiDn))|\(s.busy)"
        case .raw(let r): return "raw|\(r.tMs)|\(d(r.rssi))|\(d(r.snr))|\(r.hex)|\(r.truncated)"
        case .unknown(let l): return "unknown|\(l)"
        }
    }
    let lines = [
        "!ERR range rate>=1000", "!ERR range  rate>=1000", "!ERR  range x", "!ERR range ", "!ERR  ", "!ERR a b c", "!ERR x\ty", "#WARN duty_wait 1234", "#WARN  duty_wait   5",
        "#WARN hash_collision", "#WARN a\u{00A0}b", "#OK", "#OK ", "#OK  x", "#OK go\r", "#OK go\r\n\n", "\r\n#OK go", "#HELLO fw=1 proto=1 radio=SX id=A", "#HELLO fw=1 proto=+1 radio=SX id=A",
        "#HELLO fw=1 proto=01 radio=SX id=A", "#HELLO fw=1 proto= 1 radio=SX id=A", "#HELLO fw=1  proto=1  radio=SX id=A=B", "#HELLO fw= proto=1 radio=SX id=A", "#HELLO  fw=1 proto=1 radio=SX id=A",
        "#HELLO fw=1 proto=1 proto=2 radio=SX id=A", "#HELLO fw=1 proto=9999999999999999999 radio=SX id=A", "#CFG a=1 b= c", "#CFG  ", "#CFG x", "#CFG =v", "#CFG k=v=w",
        "R,5,-1.0,+1.0,AB,CD", "R,1,2", "R,1,-1.0,+1.0,", "R,1,-1.0,+1.0,..", "R,1,-1.0,+1.0,ABC..", "R,1,-1.0,+1.0,abcd..", "R,1,-1.0,+1.0,ab,cd,ef", "R,4294967296,1,1,AB", "R,1, 1,1,AB", "R,1,1e2,0x1p3,AB",
        "S,5,5,0,-6.25,-4.50,-108.0", "S,5,5,0,-6.25,-4.50,-108.0,2", "S,5,5,,,,", "S,5,5,,,,,1", "S,5,5,x,,,", "S,5,5,0,nan,,", "S,5,5,0,,,,x", "S,5,5,0,,,,", "S,+5,5,0,,,", 
        "S,18446744073709551616,0,,,,", "P,1,0000000A,ok,300,+9.25,+8.50,-35.0,1", "P,1,0000000a,ok,300,+9.25,+8.50,-35.0,1", "P,1,0000000A,busy,garbage,x,y,z,0", "P,1,0000000A,busy,,,,,0,extra",
        "P,1,0000000A,ok,300,+9.25,+8.50,-35.0", "P,4294967296,0000000A,busy,,,,,0", "P,4294967295,0000000A,busy,,,,,255", "P,1,0000000A,busy,,,,,256", "P,01,0000000A,busy,,,,,0",
        "P,1,0000000A,OK,300,+9.25,+8.50,-35.0,1", "P,1,0000000A,ok,300,1e1,.5,-35.,1", "P,1,0000000A,ok,300,inf,+8.50,-35.0,1", "P,1,0000000A,ok,300,0x1p3,+8.50,-35.0,1", "P,1,0000000A,ok,-1,1,1,1,1",
        "P,1,0000000A,ok,4294967296,1,1,1,1", "P,1,0000000A,ok,4294967295,1,1,1,1", "P,1, 0000000A,ok,1,1,1,1,1", "P,1,0000000AB,ok,1,1,1,1,1", "P,1,0000000G,ok,1,1,1,1,1", "P,٣,0000000A,busy,,,,,0",
        "X,1", "", "p,1", "P", "P,", "#HELLO", "#HELLO ", "!ERR", "!ERR ", "#WARN", "#WARN ",
    ]
    out["parseLines"] = lines.map { ["in": $0, "out": canon(LineCodec.parse($0))] }

    // LineAssembler con trozos de bytes crudos (FS-06)
    let invalidUtf8: [[UInt8]] = [[0xC3], [0xE2, 0x82], [0xF0, 0x9F, 0x98], [0xFF], [0xED, 0xA0, 0x80], [0xC0, 0x80], [0xF4, 0x90, 0x80, 0x80], [0xE0, 0x80, 0x80], [0xC3, 0x28], [0xE2, 0x82, 0x28],
                                  [0xF0, 0x9F, 0x98, 0x28], [0x80], [0xBF, 0xBF], [0xF8, 0x88, 0x80, 0x80, 0x80], [0xC3, 0xA9], [0xF0, 0x9F, 0x98, 0x80], [0x41, 0xE2, 0x82], [0xF0, 0x80]]
    out["utf8"] = invalidUtf8.map { b -> [String: Any] in
        var a = LineAssembler()
        let lines = a.feed(Data([0x78] + b + [0x79, 0x0A]))
        return ["bytes": b.map { Int($0) }, "out": lines.first.map { $0.unicodeScalars.map { Int($0.value) } } ?? []]
    }

    // MARK: - SessionRules, CSV, JSON de sesión
    step("SessionRules, CSV, JSON de sesión")

    func date(_ iso: String) -> Date {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso)!
    }
    let utc5 = TimeZone(secondsFromGMT: -5 * 3600)!
    func sampleOf(_ idx: Int, ok: Bool = true, unstable: Bool = false, invalid: Bool = false) -> Sample {
        let r = PingResult(seq: UInt32(idx), tag: "AABBCCDD", status: ok ? .ok : .timeout, rttMs: ok ? 300 : nil, snrUp: ok ? 9.25 : nil, snrDn: ok ? -0.5 : nil, rssiDn: ok ? -108 : nil, nResp: ok ? 1 : 0)
        var s = Sample(readingIndex: idx > 2 ? 2 : 1, tTx: date("2026-10-15T07:12:03.215-05:00"), tRx: date("2026-10-15T07:12:04.600-05:00"),
                       headingTx: 61.04, headingRx: 61.5, headingAccuracy: 5, latitude: 3.4516, longitude: -76.532, altitude: 1012.34,
                       hAccuracy: 4.8, targetBearing: 62.75, delta: 1.7, unstable: unstable, invalid: invalid, result: r)
        s.id = UUID(uuidString: String(format: "AAAAAAAA-0000-0000-0000-%012d", idx))!
        return s
    }
    func sessionOf(name: String = "Cerro Pico", samples: [Sample], tz: Bool = true) -> Session {
        var s = Session(repeater: Repeater(id: UUID(uuidString: ids[0])!, name: name, latitude: 3.5, longitude: -76.6, hashPrefix: "4F"),
                        started: date("2026-10-15T07:12:03.215-05:00"), txpDbm: 22, fw: "0.1.0", proto: 1, samples: samples)
        s.id = UUID(uuidString: "BBBBBBBB-0000-0000-0000-000000000001")!
        return s
    }
    let tzs: [(String, TimeZone)] = [("-05:00", utc5), ("UTC", TimeZone(secondsFromGMT: 0)!), ("+05:30", TimeZone(secondsFromGMT: 19800)!), ("-00:30", TimeZone(secondsFromGMT: -1800)!)]
    let example = sessionOf(samples: [sampleOf(1), sampleOf(2, unstable: true), sampleOf(3, invalid: true), sampleOf(4, ok: false)])
    out["csvExample"] = tzs.map { ["tz": $0.0, "csv": SessionCSV.make(example, timeZone: $0.1), "fileName": SessionCSV.fileName(for: example, timeZone: $0.1)] }
    let noAlt: Sample = { var s = sampleOf(1); s.altitude = nil; s.result.snrUp = -0.004; s.result.rssiDn = -0.04; return s }()
    out["csvEdge"] = SessionCSV.make(sessionOf(samples: [noAlt]), timeZone: utc5)
    let escapes = ["plano", "Cerro, Cali", "El \"Pico\"", "a\nb", "a\rb", "a\r\nb", ",\u{0301}x", "\"\u{0301}", "é", "", "a,b\r\nc"]
    out["csvEscape"] = escapes.map { ["in": $0, "out": SessionCSV.escape($0)] }
    let names = ["Cerro El Pico/Cali ñ", "ñ", "n\u{0303}", "🇨🇴", "👨‍👩‍👧", "a-b_c", "", "ABC xyz 019", "e\u{0301}", "a\r\nb", "日本", "❤️", "👍🏽"]
    out["csvFileName"] = names.map { ["in": $0, "out": SessionCSV.fileName(for: sessionOf(name: $0, samples: []), timeZone: utc5)] }
    let isoDates: [Double] = [1792062723.215, 1792062723.2154, 1792062723.2155, 1792062723.9996, 1792062723.0, 1792062723.0005, 1792062723.9999, -1.0005, 0.0]
    out["isoMillis"] = isoDates.map { x -> [String: Any] in
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var row: [String: Any] = ["epoch": bits(x)]
        for (n, tz) in tzs { f.timeZone = tz; row[n] = f.string(from: Date(timeIntervalSince1970: x)) }
        return row
    }
    let encSession = JSONEncoder(); encSession.outputFormatting = [.sortedKeys]
    out["sessionJson"] = String(decoding: try! encSession.encode(example), as: UTF8.self)

    // SessionRules (datos de SessionRulesTests)
    let here = CLLocation(coordinate: .init(latitude: 3.45, longitude: -76.53), altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date())
    let hereNoV = CLLocation(coordinate: .init(latitude: 3.45, longitude: -76.53), altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: Date())
    func report(_ status: PingResult.Status = .ok, up: Double? = -6.25, dn: Double? = -4.5, rssi: Double? = -108, duty: Bool = false) -> PingReport {
        let ok = status == .ok
        let r = PingResult(seq: 1, tag: "AABBCCDD", status: status, rttMs: ok ? 300 : nil, snrUp: ok ? up : nil, snrDn: ok ? dn : nil, rssiDn: ok ? rssi : nil, nResp: ok ? 1 : 0)
        return PingReport(result: r, tTx: date("2026-10-15T07:12:03.215-05:00"), tRx: date("2026-10-15T07:12:04.600-05:00"), dutyWait: duty)
    }
    func sample(hTx: Double = 100, moved: Double = 0, target: Double = 100, loc: CLLocation? = nil, _ rep: PingReport) -> Sample {
        SessionRules.makeSample(readingIndex: 1, report: rep, headingTx: hTx, headingRx: Geo.normalize(hTx + moved), headingAccuracy: 5, location: loc ?? here, targetBearing: target)
    }
    func sampleBits(_ s: Sample) -> [String: Any] {
        ["unstable": s.unstable, "invalid": s.invalid, "delta": bits(s.delta), "altitude": bitsOpt(s.altitude), "hAccuracy": bits(s.hAccuracy), "headingRx": bits(s.headingRx)]
    }
    func readingBits(_ r: Reading) -> [String: Any] {
        ["meanHeading": bitsOpt(r.meanHeading), "meanDelta": bitsOpt(r.meanDelta), "medSnrUp": bitsOpt(r.medSnrUp), "medSnrDn": bitsOpt(r.medSnrDn), "medRssiDn": bitsOpt(r.medRssiDn),
         "lossPct": r.lossPct.map { $0 as Any } ?? NSNull(), "stableCount": r.stableCount, "needsRepeat": r.needsRepeat]
    }
    var rules: [String: Any] = [:]
    rules["samples"] = [sample(moved: 2.0, report()), sample(moved: 2.1, report()), sample(moved: -3, report()), sample(hTx: 359, moved: 2, report()), sample(hTx: 359, moved: 4, report()),
                        sample(report(duty: true)), sample(hTx: 350, target: 10, report()), sample(hTx: 10, target: 350, report()), sample(loc: hereNoV, report())].map(sampleBits)
    let ups = [-6.25, -6.0, -5.75, -6.5, -6.25]
    let readingCases: [(String, [Sample])] = [
        ("five", ups.map { sample(report(up: $0, dn: $0 + 2, rssi: $0 * 10)) }),
        ("even", [-6.25, -4.5, -3.0, -8.0].map { sample(report(up: $0)) }),
        ("dutyExcluded", (0..<4).map { _ in sample(report(up: -6.0)) } + [sample(report(up: 20.0, duty: true))]),
        ("unstableExcluded", (0..<3).map { _ in sample(report(up: -6.0)) } + (0..<2).map { _ in sample(moved: 3, report(up: 15.0)) }),
        ("fewStable", [sample(report()), sample(report())] + (0..<3).map { _ in sample(moved: 5, report()) }),
        ("noneUsable", (0..<3).map { _ in sample(report(.timeout)) }),
        ("lossFifth", [sample(report()), sample(report()), sample(report()), sample(report()), sample(report(.timeout))]),
        ("lossThird", [sample(report()), sample(report()), sample(report(.timeout)), sample(report(.busy))]),
        ("lossNone", [sample(report(.busy)), sample(report(.txerr))]),
        ("lossEighth", (0..<7).map { _ in sample(report()) } + [sample(report(.timeout))]),
        ("meanHeadingNorth", [358.0, 2, 0].map { sample(hTx: $0, target: $0, report()) }),
        ("meanDeltaOpposite", [sample(hTx: 100, target: 279, report()), sample(hTx: 100, target: 100 - 179, report())]),
        ("empty", []),
    ]
    rules["readings"] = readingCases.map { ["case": $0.0, "reading": readingBits(SessionRules.makeReading(index: 1, samples: $0.1))] }
    rules["headingValid"] = [-1.0, 0, 15, 15.1, 20, -0.0001].map { ["in": bits($0), "out": SessionRules.headingIsValid($0)] }
    out["sessionRules"] = rules

    // MARK: - SimulatedPinger: respuestas, secuencia de la semilla
    step("SimulatedPinger: respuestas, secuencia de la semilla")

    out["simulator"] = [
        "seed1_aligned": await run(seed: 1, heading: 40, target: 72, pings: 25),
        "seed1_noInputs": await run(seed: 1, heading: nil, target: nil, pings: 10),
        "seed1_far": await run(seed: 1, heading: 10, target: 200, pings: 10),
        "seed12345_aligned": await run(seed: 12345, heading: 72, target: 72, pings: 10),
    ]

    // MARK: - FS-07 fechas con región explícita
    step("FS-07 fechas con región explícita")

    var dateStyle: [[String: Any]] = []
    let base = date("2026-10-14T17:28:00.000-05:00")
    var probes: [(String, Date)] = []
    for m in 1...12 { probes.append(("m\(m)", date(String(format: "2026-%02d-05T17:28:00.000-05:00", m)))) }
    for (i, h) in [0, 1, 9, 11, 12, 13, 17, 23].enumerated() { probes.append(("h\(h)", date(String(format: "2026-10-%02dT%02d:05:00.000-05:00", 10 + i, h)))) }
    probes.append(("base", base)); probes.append(("d1", date("2026-03-01T00:00:00.000-05:00"))); probes.append(("d31", date("2026-12-31T23:59:00.000-05:00"))); probes.append(("y1999", date("1999-01-02T03:04:00.000-05:00")))
    for loc in ["es_CO", "en_US", "es_ES", "en_GB", "pt_BR"] {
        for (label, d) in probes {
            let style = Date.FormatStyle(date: .abbreviated, time: .shortened, locale: Locale(identifier: loc), timeZone: utc5)
            dateStyle.append(["locale": loc, "case": label, "epochMs": Int((d.timeIntervalSince1970 * 1000).rounded()), "out": d.formatted(style)])
        }
    }
    out["dateStyle"] = dateStyle
}

for (k, v) in out where !JSONSerialization.isValidJSONObject([k: v]) { step("JSON inválido en \(k)") }
let data = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys, .prettyPrinted])
FileHandle.standardOutput.write(data)
