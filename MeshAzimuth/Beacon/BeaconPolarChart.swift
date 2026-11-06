import SwiftUI

/// Nivel por rumbo en polar (norte arriba, sentido horario). El radio es el nivel relativo al máximo:
/// el borde es el máximo y el centro, 30 dB por debajo. Marca el azimut al marcador, el rumbo actual,
/// los cruces de −3 dB y el centro estimado.
struct BeaconPolarChart: View {
    let readings: [BeaconReading]
    let peak: Double?
    let bisect: BisectResult
    var markerBearing: Double?
    var heading: Double?

    static let rangeDB = 30.0

    var body: some View {
        Canvas { ctx, size in
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let R = min(size.width, size.height) / 2 - 18
            func point(_ deg: Double, _ r: Double) -> CGPoint {
                CGPoint(x: c.x + r * sin(deg.rad), y: c.y - r * cos(deg.rad))
            }
            func radius(_ level: Double) -> Double {
                guard let peak else { return 0 }
                return R * max(0, min(1, 1 - (peak - level) / Self.rangeDB))
            }
            func ray(_ deg: Double, _ color: Color, width: CGFloat, dash: [CGFloat] = []) {
                var p = Path(); p.move(to: c); p.addLine(to: point(deg, R))
                ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, dash: dash))
            }

            // Anillos: máximo, −3, −10 y −20 dB.
            for (db, label) in [(0.0, "0"), (3, "−3"), (10, "−10"), (20, "−20")] {
                let r = R * (1 - db / Self.rangeDB)
                let ring = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
                ctx.stroke(ring, with: .color(db == 3 ? .green.opacity(0.6) : .secondary.opacity(0.35)),
                           style: StrokeStyle(lineWidth: db == 3 ? 1.5 : 0.8, dash: db == 3 ? [4, 3] : []))
                if peak != nil {
                    ctx.draw(Text(label).font(.system(size: 9)).foregroundStyle(.secondary), at: CGPoint(x: c.x + 3, y: c.y - r + 6), anchor: .leading)
                }
            }
            for (deg, name) in [(0.0, "N"), (90, "E"), (180, "S"), (270, "O")] {
                ctx.draw(Text(name).font(.caption2.bold()).foregroundStyle(.secondary), at: point(deg, R + 10))
            }

            if let markerBearing { ray(markerBearing, Theme.target, width: 2, dash: [6, 4]) }

            // Lecturas: válidas en azul, no válidas en gris.
            for r in readings {
                guard let h = r.heading else { continue }
                let p = point(h, radius(r.level))
                let d: CGFloat = r.valid ? 5 : 3
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - d / 2, y: p.y - d / 2, width: d, height: d)),
                         with: .color(r.valid ? Theme.accent : .gray.opacity(0.5)))
            }

            if case .found(let center, let left, let right, _, _, _) = bisect {
                ray(left, .green, width: 1.5)
                ray(right, .green, width: 1.5)
                ray(center, .green, width: 3.5)
            }
            if let heading { ray(heading, .primary.opacity(0.8), width: 1) }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        if let c = bisect.center { return String(format: "Gráfico polar. Centro estimado %.0f grados", c) }
        return "Gráfico polar del nivel por rumbo, \(readings.count) lecturas"
    }
}

#Preview {
    let rs = stride(from: -60.0, through: 60, by: 1.5).map { d in
        BeaconReading(t: .now, level: -65 + SimulatedPinger.yagiGain(deltaDeg: d), sd: 0.5, n: 32, kept: 32,
                      heading: Geo.normalize(40 + d), headingAccuracy: 5, pitch: 0, valid: true)
    }
    return BeaconPolarChart(readings: rs, peak: -65, bisect: BeaconBisect.estimate(rs), markerBearing: 36, heading: 45)
        .padding()
}
