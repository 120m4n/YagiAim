import Foundation

/// Exportación CSV de una sesión (specs/003.../contracts/session-csv.md): RFC 4180, UTF-8,
/// separador `,`, punto decimal, una fila por muestra.
enum SessionCSV {
    static let header = "session_id,repeater_name,repeater_hash,repeater_lat,repeater_lon,reading_idx,sample_idx,t_tx_iso,t_rx_iso,lat,lon,alt_m,h_acc_m,target_bearing_deg,heading_tx_deg,heading_rx_deg,heading_acc_deg,delta_deg,unstable,invalid,seq,tag,status,rtt_ms,snr_up_db,snr_dn_db,rssi_dn_dbm,n_resp,txp_dbm,fw,proto"

    static func make(_ s: Session, timeZone: TimeZone = .current) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        iso.timeZone = timeZone

        var rows = [header]
        var position: [Int: Int] = [:]      // sample_idx: orden dentro de su lectura
        for sample in s.samples {
            let n = (position[sample.readingIndex] ?? 0) + 1
            position[sample.readingIndex] = n
            let r = sample.result
            let fields: [String] = [
                s.id.uuidString, s.repeater.name, s.repeater.hashPrefix ?? "",
                f(s.repeater.latitude, 6), f(s.repeater.longitude, 6),
                String(sample.readingIndex), String(n),
                iso.string(from: sample.tTx), iso.string(from: sample.tRx),
                f(sample.latitude, 6), f(sample.longitude, 6), sample.altitude.map { f($0, 1) } ?? "", f(sample.hAccuracy, 1),
                f(sample.targetBearing, 1), f(sample.headingTx, 1), f(sample.headingRx, 1), f(sample.headingAccuracy, 1), f(sample.delta, 1),
                sample.unstable ? "1" : "0", sample.invalid ? "1" : "0",
                String(r.seq), r.tag, r.status.rawValue,
                r.rttMs.map(String.init) ?? "",
                r.snrUp.map { String(format: "%+.2f", $0) } ?? "", r.snrDn.map { String(format: "%+.2f", $0) } ?? "",
                r.rssiDn.map { String(format: "%+.1f", $0) } ?? "",
                String(r.nResp), s.txpDbm.map(String.init) ?? "", s.fw ?? "", String(s.proto),
            ]
            rows.append(fields.map(escape).joined(separator: ","))
        }
        return rows.joined(separator: "\r\n") + "\r\n"
    }

    /// `meshazimuth_<repetidor>_<yyyyMMdd-HHmmss>.csv`
    static func fileName(for s: Session, timeZone: TimeZone = .current) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = timeZone
        df.dateFormat = "yyyyMMdd-HHmmss"
        let safe = String(s.repeater.name.map { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") ? $0 : "_" })
        return "meshazimuth_\(safe)_\(df.string(from: s.started)).csv"
    }

    /// RFC 4180: un campo con coma, comilla o salto de línea va entre comillas y las comillas se duplican.
    static func escape(_ field: String) -> String {
        guard field.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    private static func f(_ v: Double, _ decimals: Int) -> String { String(format: "%.\(decimals)f", v) }
}
