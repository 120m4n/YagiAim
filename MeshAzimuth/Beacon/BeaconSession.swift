import Foundation
import Observation

/// Una respuesta `M,` con el rumbo y la inclinación del teléfono al recibirla (FR-022).
struct BeaconReading: Equatable, Codable {
    var t: Date
    var level: Double          // MeasResult.mean, dBm
    var sd: Double
    var n: Int, kept: Int
    var heading: Double?
    var headingAccuracy: Double
    var pitch: Double?
    var valid: Bool            // limpia, nivel ≥ piso + 10 dB y brújula ≤ ±15°
}

/// Lo que miden los sensores en el instante de la respuesta.
struct BeaconPose {
    var heading: Double?
    var headingAccuracy: Double      // < 0 = sin calibrar
    var pitch: Double?
}

/// Un barrido hacia un sitio: piso, lecturas, máximo retenido y bisección. Vive en memoria (no se guarda).
@MainActor @Observable
final class BeaconSweep {
    enum Phase: Equatable { case idle, floor, metering, paused, failed(String) }

    static let maxLevel = -50.0          // por encima, el receptor se comprime y el máximo se aplana
    static let minMargin = 10.0          // dB sobre el piso para usar una lectura
    static let maxHeadingAccuracy = 15.0
    static let floorSamples = 64

    let site: BeaconSite
    /// Identifica el barrido en el CSV; "Nuevo barrido" da otro.
    private(set) var id = UUID()
    private(set) var fw: String?
    private(set) var phase: Phase = .idle
    private(set) var floor: Double?
    private(set) var readings: [BeaconReading] = []
    private(set) var last: BeaconReading?
    private(set) var peak: BeaconReading?
    private(set) var bisect: BisectResult = .notEnough
    private(set) var dirty = 0           // descartadas por tráfico ajeno (kept < 0,8·n)
    private(set) var startedAt: Date?

    /// Solo depuración: rumbo manual cuando no hay brújula (simulador de iOS).
    var simHeading: Double?

    init(site: BeaconSite) { self.site = site }

    var validCount: Int { readings.lazy.filter(\.valid).count }

    /// Mide el piso una vez (si no lo hay), vuelve a la frecuencia de la baliza y arranca el medidor.
    func start(link: PingerLink, pose: @escaping @MainActor () -> BeaconPose) async {
        guard link.isOperational else { return }
        fw = link.device?.fw
        link.stopMeter()
        do {
            if floor == nil {
                phase = .floor
                try await link.setFrequency(BeaconSite.floorFreq(for: site.freq))
                floor = try await link.meas(n: Self.floorSamples).mean
            }
            try await link.setFrequency(site.freq)
        } catch {
            phase = .failed(Self.describe(error))
            return
        }
        startedAt = startedAt ?? .now
        phase = .metering
        link.startMeter { [weak self] m in self?.add(m, pose: pose()) }
    }

    func pause(link: PingerLink) {
        link.stopMeter()
        if phase == .metering { phase = .paused }
    }

    /// "Nuevo barrido": borra lecturas y máximo; conserva el piso y la frecuencia (US3-4).
    func reset() {
        readings = []; last = nil; peak = nil; bisect = .notEnough; dirty = 0; startedAt = nil; id = UUID()
    }

    func add(_ m: MeasResult, pose: BeaconPose) {
        let compassOK = pose.heading != nil && pose.headingAccuracy >= 0 && pose.headingAccuracy <= Self.maxHeadingAccuracy
        let strongEnough = floor.map { m.mean >= $0 + Self.minMargin } ?? false
        let r = BeaconReading(t: .now, level: m.mean, sd: m.sd, n: m.n, kept: m.kept, heading: pose.heading,
                              headingAccuracy: pose.headingAccuracy, pitch: pose.pitch,
                              valid: m.clean && strongEnough && compassOK)
        readings.append(r)
        last = r
        if !m.clean { dirty += 1 }
        guard r.valid else { return }
        if r.level > (peak?.level ?? -.infinity) { peak = r }
        bisect = BeaconBisect.estimate(readings)
    }

    /// Avisos de FR-025 y de los casos borde, según la última lectura.
    var warnings: [String] {
        guard let last else { return [] }
        var w: [String] = []
        if last.level > Self.maxLevel {
            w.append("Demasiado fuerte: el máximo se aplana. Usa una baliza de menor nivel o más distancia.")
        }
        if let floor {
            if last.level < floor + 3 {
                w.append("No oigo la baliza en \(site.freq) MHz: revisa que esté encendida (su LED parpadea) y su frecuencia.")
            } else if last.level < floor + Self.minMargin {
                w.append("Señal débil (menos de \(Int(Self.minMargin)) dB sobre el piso): no cuenta para la bisección.")
            }
        }
        if last.kept * 5 < last.n * 4 { w.append("Tráfico ajeno en la última lectura: descartada.") }
        if last.heading == nil || last.headingAccuracy < 0 || last.headingAccuracy > Self.maxHeadingAccuracy {
            w.append("Brújula imprecisa (peor que ±\(Int(Self.maxHeadingAccuracy))°): calíbrala; estas lecturas no cuentan.")
        }
        return w
    }

    private static func describe(_ error: Error) -> String {
        switch error {
        case let e as LinkError: e.message
        case PingerError.rejected(let code, let detail): "El pinger rechazó el comando: \(code)\(detail.map { " \($0)" } ?? "")"
        case PingerError.requestInFlight: "El pinger está ocupado; inténtalo de nuevo."
        default: error.localizedDescription
        }
    }
}
