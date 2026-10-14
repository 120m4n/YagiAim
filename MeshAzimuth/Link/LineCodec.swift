import Foundation

// Protocolo de líneas `proto=1` del pinger (specs/001.../contracts/line-protocol.md).
// Mismo texto por Serial y BLE. Se valida con los fixtures compartidos con el firmware (SC-006).

struct PingResult: Equatable, Codable {
    enum Status: String, Codable { case ok, timeout, busy, txerr }
    var seq: UInt32
    var tag: String              // 8 hex en mayúsculas, en el orden de impresión del firmware
    var status: Status
    var rttMs: UInt32?           // solo con status == .ok
    var snrUp: Double?           // dB; SNR con que el repetidor oyó al pinger (viene en el eco)
    var snrDn: Double?           // dB; SNR con que el pinger oyó al repetidor
    var rssiDn: Double?          // dBm
    var nResp: UInt8             // ecos aceptados con ese tag (>1 = posible colisión de hash)
}

/// Línea `S,`: resumen de una ráfaga `PING n` del pinger (la app usa `PING` sueltos y calcula el suyo).
struct BurstSummary: Equatable {
    var n: Int
    var ok: Int
    var lossPct: Int?
    var medSnrUp: Double?
    var medSnrDn: Double?
    var medRssiDn: Double?
    var busy: Int                // busy + txerr; no cuentan como pérdida
}

/// Línea `R,`: trama cruda. El firmware trunca a 64 bytes y marca con `..`.
struct RawFrame: Equatable {
    var tMs: UInt32
    var rssi: Double
    var snr: Double
    var hex: String              // sin el sufijo ".."
    var truncated: Bool
}

enum PingerEvent: Equatable {
    case hello(fw: String, proto: Int, radio: String, id: String)
    case cfg([String: String])
    case ok(String)                          // texto tras "#OK " ("go", "hash=A1"…)
    case warn(code: String, detail: String?)
    case error(code: String, detail: String?)
    case ping(PingResult)
    case summary(BurstSummary)
    case raw(RawFrame)
    case unknown(String)                     // prefijo desconocido o línea mal formada: se ignora (contrato, regla 3)
}

enum LineCodec {
    /// Interpreta una línea completa (sin `\n`). Nunca falla: lo que no entiende es `.unknown`.
    static func parse(_ raw: String) -> PingerEvent {
        let line = raw.trimmingCharacters(in: CharacterSet(charactersIn: "\r\n"))
        let event: PingerEvent?
        if line.hasPrefix("P,") { event = ping(line.dropFirst(2)) }
        else if line.hasPrefix("S,") { event = summary(line.dropFirst(2)) }
        else if line.hasPrefix("R,") { event = rawFrame(line.dropFirst(2)) }
        else if line.hasPrefix("#HELLO ") { event = hello(line.dropFirst(7)) }
        else if line.hasPrefix("#CFG ") { event = cfg(line.dropFirst(5)) }
        else if line.hasPrefix("#OK ") { event = .ok(String(line.dropFirst(4))) }
        else if line.hasPrefix("#WARN ") { event = codeAndDetail(line.dropFirst(6)).map { .warn(code: $0.code, detail: $0.detail) } }
        else if line.hasPrefix("!ERR ") { event = codeAndDetail(line.dropFirst(5)).map { .error(code: $0.code, detail: $0.detail) } }
        else { event = nil }
        return event ?? .unknown(line)
    }

    // MARK: - Eventos

    private static func ping(_ body: Substring) -> PingerEvent? {
        // seq,tag,status,rtt,snr_up,snr_dn,rssi,n_resp  (se toleran campos añadidos al final)
        let f = body.split(separator: ",", omittingEmptySubsequences: false)
        guard f.count >= 8,
              let seq = uint(f[0]), UInt64(seq) <= UInt64(UInt32.max),
              isHex(f[1]), f[1].count == 8,
              let status = PingResult.Status(rawValue: String(f[2])),
              let nResp = uint(f[7]), nResp <= UInt(UInt8.max) else { return nil }

        var rtt: UInt32?, up: Double?, dn: Double?, rssi: Double?
        if status == .ok {
            guard let r = uint(f[3]), r <= UInt(UInt32.max), let u = number(f[4]), let d = number(f[5]), let s = number(f[6]) else { return nil }
            rtt = UInt32(r); up = u; dn = d; rssi = s
        }
        return .ping(PingResult(seq: UInt32(seq), tag: f[1].uppercased(), status: status, rttMs: rtt,
                                snrUp: up, snrDn: dn, rssiDn: rssi, nResp: UInt8(nResp)))
    }

    private static func summary(_ body: Substring) -> PingerEvent? {
        // n,ok,loss,med_up,med_dn,med_rssi[,busy]  (busy ausente = 0, firmware anterior)
        let f = body.split(separator: ",", omittingEmptySubsequences: false)
        guard f.count >= 6, let n = uint(f[0]), let ok = uint(f[1]) else { return nil }
        let loss: Int?, up: Double?, dn: Double?, rssi: Double?
        if f[2].isEmpty { loss = nil } else if let l = uint(f[2]) { loss = Int(l) } else { return nil }
        if f[3].isEmpty { up = nil } else if let v = number(f[3]) { up = v } else { return nil }
        if f[4].isEmpty { dn = nil } else if let v = number(f[4]) { dn = v } else { return nil }
        if f[5].isEmpty { rssi = nil } else if let v = number(f[5]) { rssi = v } else { return nil }
        var busy = 0
        if f.count >= 7 { guard let b = uint(f[6]) else { return nil }; busy = Int(b) }
        return .summary(BurstSummary(n: Int(n), ok: Int(ok), lossPct: loss, medSnrUp: up, medSnrDn: dn, medRssiDn: rssi, busy: busy))
    }

    private static func rawFrame(_ body: Substring) -> PingerEvent? {
        // t_ms,rssi,snr,hex  (el hex va al final y puede terminar en "..")
        let f = body.split(separator: ",", maxSplits: 3, omittingEmptySubsequences: false)
        guard f.count == 4, let t = uint(f[0]), t <= UInt(UInt32.max), let rssi = number(f[1]), let snr = number(f[2]) else { return nil }
        var hex = f[3]
        let truncated = hex.hasSuffix("..")
        if truncated { hex = hex.dropLast(2) }
        guard hex.count % 2 == 0, hex.allSatisfy({ $0.isHexDigit && $0.isASCII }) else { return nil }
        return .raw(RawFrame(tMs: UInt32(t), rssi: rssi, snr: snr, hex: hex.uppercased(), truncated: truncated))
    }

    private static func hello(_ body: Substring) -> PingerEvent? {
        let kv = keyValues(body)
        guard let fw = kv["fw"], let proto = kv["proto"].flatMap({ Int($0) }),
              let radio = kv["radio"], let id = kv["id"] else { return nil }
        return .hello(fw: fw, proto: proto, radio: radio, id: id)
    }

    private static func cfg(_ body: Substring) -> PingerEvent? {
        let kv = keyValues(body)
        return kv.isEmpty ? nil : .cfg(kv)
    }

    // MARK: - Ayudas

    /// "k=v k2=v2 clave=" -> diccionario (el valor puede ir vacío, como `hash=`).
    private static func keyValues(_ s: Substring) -> [String: String] {
        var out: [String: String] = [:]
        for token in s.split(separator: " ") {
            guard let eq = token.firstIndex(of: "=") else { continue }
            out[String(token[..<eq])] = String(token[token.index(after: eq)...])
        }
        return out
    }

    /// "range rate>=1000" -> (code: "range", detail: "rate>=1000"); el detalle es el resto de la línea.
    private static func codeAndDetail(_ s: Substring) -> (code: String, detail: String?)? {
        let parts = s.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
        guard let code = parts.first else { return nil }
        return (String(code), parts.count > 1 ? String(parts[1]) : nil)
    }

    /// Entero sin signo estricto: solo dígitos ASCII (rechaza "+5", " 5", "-1", "").
    private static func uint(_ s: Substring) -> UInt? {
        guard !s.isEmpty, s.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        return UInt(s)
    }

    /// Decimal con signo opcional ("+3.25", "-6.00"); rechaza vacío, "nan" e "inf".
    private static func number(_ s: Substring) -> Double? {
        guard let v = Double(s), v.isFinite else { return nil }
        return v
    }

    private static func isHex(_ s: Substring) -> Bool {
        !s.isEmpty && s.allSatisfy { $0.isASCII && $0.isHexDigit }
    }
}

/// Reensambla líneas completas a partir de notificaciones BLE (o lecturas de Serial) en trozos arbitrarios.
/// - Separa por `\n` (tolera `\r\n`), ignora líneas vacías y decodifica UTF-8 solo al cerrar la línea,
///   así un carácter multibyte partido entre dos notificaciones no se corrompe.
/// - Tope de 160 B con el terminador (como el firmware): una línea más larga se descarta entera
///   y se cuenta en `overflowCount`; el siguiente `\n` resincroniza.
struct LineAssembler {
    static let maxLine = 160
    private var buffer: [UInt8] = []
    private var discarding = false
    private(set) var overflowCount = 0

    mutating func feed(_ data: Data) -> [String] {
        var lines: [String] = []
        for byte in data {
            if byte == 0x0A {
                if discarding {
                    discarding = false
                    overflowCount += 1
                } else if let line = take() {
                    lines.append(line)
                }
                continue
            }
            if discarding { continue }
            buffer.append(byte)
            if buffer.count > Self.maxLine - 1 {   // 159 B de contenido + '\n' = 160
                buffer.removeAll(keepingCapacity: true)
                discarding = true
            }
        }
        return lines
    }

    mutating func feed(_ text: String) -> [String] { feed(Data(text.utf8)) }

    private mutating func take() -> String? {
        defer { buffer.removeAll(keepingCapacity: true) }
        if buffer.last == 0x0D { buffer.removeLast() }
        return buffer.isEmpty ? nil : String(decoding: buffer, as: UTF8.self)
    }
}
