import SwiftUI

/// Rosa de los vientos que gira con el teléfono. El triángulo fijo arriba es
/// la dirección del boom de la Yagi; la aguja naranja es el repetidor.
struct CompassView: View {
    let heading: Double?      // rumbo actual del teléfono (verdadero)
    let target: Double?       // azimut al repetidor
    var tolerance: Double = 3 // ° para considerar "alineado"
    var onAlignedChange: (Bool) -> Void = { _ in }

    @State private var aligned = false
    @State private var shownHeading: Double?   // rumbo/delta desenrollados: solo para animar sin saltos en 360°/0°
    @State private var shownDelta: Double?

    private var delta: Double? {
        guard let heading, let target else { return nil }
        return Geo.signedDelta(target: target, current: heading)
    }

    private func unwrapShown() {
        shownHeading = Self.unwrapped(heading, previous: shownHeading)
        shownDelta = Self.unwrapped(delta, previous: shownDelta)
    }

    private static func unwrapped(_ new: Double?, previous: Double?) -> Double? {
        guard let new else { return nil }
        return previous.map { Geo.unwrap(previous: $0, new: new) } ?? new
    }

    private func updateAligned() {
        let now = Geo.isAligned(delta: delta, tolerance: tolerance, wasAligned: aligned)
        if now != aligned { aligned = now }
    }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            ZStack {
                dial(size: size)
                    .rotationEffect(.degrees(-(shownHeading ?? 0)))
                    .animation(.easeOut(duration: 0.15), value: shownHeading)

                // Haz de la Yagi (±tolerancia) — fijo, apunta al frente del teléfono.
                BeamWedge(halfAngle: max(tolerance, 1))
                    .fill((aligned ? Color.green : Color.secondary).opacity(0.18))
                    .frame(width: size, height: size)

                if let delta = shownDelta {
                    Needle()
                        .fill(aligned ? Color.green : Theme.target)
                        .frame(width: size * 0.07, height: size * 0.42)
                        .offset(y: -size * 0.21)
                        .rotationEffect(.degrees(delta))
                        .animation(.easeOut(duration: 0.15), value: shownDelta)
                }

                Triangle()
                    .fill(aligned ? Color.green : Color.primary)
                    .frame(width: size * 0.06, height: size * 0.05)
                    .offset(y: -size / 2 + size * 0.01)

                Circle().fill(Color.primary).frame(width: size * 0.04)
            }
            .frame(width: size, height: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
        .onChange(of: heading, initial: true) { unwrapShown() }
        .onChange(of: delta, initial: true) { unwrapShown(); updateAligned() }
        .onChange(of: tolerance) { updateAligned() }
        .onChange(of: aligned) { _, isAligned in
            onAlignedChange(isAligned)
            if isAligned { Haptics.shared.startAligned() } else { Haptics.shared.stop() }
        }
        .accessibilityElement()
        .accessibilityLabel(accessibilityText)
    }

    private func dial(size: CGFloat) -> some View {
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.4), lineWidth: 1.5)
            ForEach(0..<72) { i in
                let major = i % 9 == 0, mid = i % 3 == 0
                Rectangle()
                    .fill(Color.secondary.opacity(major ? 1 : 0.55))
                    .frame(width: major ? 2 : 1, height: major ? size * 0.06 : (mid ? size * 0.04 : size * 0.025))
                    .offset(y: -size / 2 + size * 0.06)
                    .rotationEffect(.degrees(Double(i) * 5))
            }
            ForEach(Array(["N", "E", "S", "O"].enumerated()), id: \.offset) { i, label in
                Text(label)
                    .font(.system(size: size * 0.07, weight: .bold, design: .rounded))
                    .foregroundStyle(label == "N" ? Color.red : Color.primary)
                    .offset(y: -size * 0.33)
                    .rotationEffect(.degrees(Double(i) * 90))
            }
            ForEach([30, 60, 120, 150, 210, 240, 300, 330], id: \.self) { d in
                Text("\(d)")
                    .font(.system(size: size * 0.035, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .offset(y: -size * 0.34)
                    .rotationEffect(.degrees(Double(d)))
            }
        }
    }

    private var accessibilityText: String {
        guard let delta, let target else { return "Sin datos de brújula" }
        if aligned { return "Alineado con el repetidor, azimut \(Int(target)) grados" }
        return String(format: "Gira %.0f grados a la %@", abs(delta), delta > 0 ? "derecha" : "izquierda")
    }
}

private struct Needle: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY - r.width * 0.6))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

private struct Triangle: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        p.closeSubpath()
        return p
    }
}

/// Cuña desde el centro hacia arriba, ±halfAngle grados.
private struct BeamWedge: Shape {
    var halfAngle: Double
    func path(in r: CGRect) -> Path {
        let c = CGPoint(x: r.midX, y: r.midY)
        var p = Path()
        p.move(to: c)
        p.addArc(center: c, radius: r.width / 2,
                 startAngle: .degrees(-90 - halfAngle), endAngle: .degrees(-90 + halfAngle),
                 clockwise: false)
        p.closeSubpath()
        return p
    }
}

#Preview {
    CompassView(heading: 40, target: 72).padding()
}
