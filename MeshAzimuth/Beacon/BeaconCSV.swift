import CoreLocation
import Foundation

/// CSV de un barrido de baliza (specs/005.../contracts/beacon-sweep-csv.md). Mismas convenciones que el de
/// sesiones TRACE (RFC 4180, UTF-8, `,`, punto decimal, ISO 8601 con ms, `\r\n`), pero es otro archivo.
/// Filas `R` (una por lectura) y una `B` final con la estimación si la hubo.
enum BeaconCSV {
    static let header = "sweep_id,kind,t_iso,point,lat,lon,map_bearing_deg,beacon_freq_mhz,floor_dbm,heading_deg,heading_acc_deg,pitch_deg,level_dbm,sd_db,n,kept,valid,center_deg,left_deg,right_deg,beamwidth_deg,peak_dbm,fw"

    /// `observer`: posición del teléfono (sitio A) al exportar; `mapBearing`: azimut desde ahí al marcador.
    static func make(id: UUID, site: BeaconSite, observer: CLLocationCoordinate2D?, mapBearing: Double?,
                     floor: Double?, readings: [BeaconReading], bisect: BisectResult, fw: String?,
                     timeZone: TimeZone = .current) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        iso.timeZone = timeZone

        let common = { (t: Date) -> [String] in
            [id.uuidString, "", iso.string(from: t), site.name,
             observer.map { f($0.latitude, 6) } ?? "", observer.map { f($0.longitude, 6) } ?? "",
             mapBearing.map { f($0, 1) } ?? "", site.freq, floor.map { f($0, 2) } ?? ""]
        }
        var rows = [header]
        for r in readings {
            var c = common(r.t); c[1] = "R"
            rows.append(row(c + [
                r.heading.map { f($0, 1) } ?? "", r.headingAccuracy >= 0 ? f(r.headingAccuracy, 1) : "",
                r.pitch.map { f($0, 1) } ?? "", f(r.level, 2), f(r.sd, 2), String(r.n), String(r.kept), r.valid ? "1" : "0",
                "", "", "", "", "", fw ?? "",
            ]))
        }
        if case .found(let center, let left, let right, let width, let peak, _) = bisect {
            var c = common(readings.last?.t ?? .now); c[1] = "B"
            rows.append(row(c + ["", "", "", "", "", "", "", "",
                                 f(center, 1), f(left, 1), f(right, 1), f(width, 1), f(peak, 2), fw ?? ""]))
        }
        return rows.joined(separator: "\r\n") + "\r\n"
    }

    /// `meshazimuth_baliza_<punto>_<yyyyMMdd-HHmmss>.csv`
    static func fileName(site: BeaconSite, started: Date, timeZone: TimeZone = .current) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = timeZone
        df.dateFormat = "yyyyMMdd-HHmmss"
        let safe = String(site.name.map { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") ? $0 : "_" })
        return "meshazimuth_baliza_\(safe)_\(df.string(from: started)).csv"
    }

    private static func row(_ fields: [String]) -> String { fields.map(SessionCSV.escape).joined(separator: ",") }
    private static func f(_ v: Double, _ decimals: Int) -> String { String(format: "%.\(decimals)f", v) }
}
