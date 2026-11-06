import SwiftUI

/// Resultados del barrido: rumbo central por bisección a −3 dB, contraste con el marcador y guía de brújula
/// hacia el centro estimado o hacia el marcador (FR-026: objetivo temporal; el sitio guardado no cambia).
struct BeaconResultView: View {
    let sweep: BeaconSweep
    @Environment(LocationManager.self) private var loc
    @AppStorage("tolerance") private var tolerance = 3.0
    @State private var guideToCenter = true
    @State private var aligned = false
    @State private var csvURL: URL?

    private enum Agreement { case good, fair, poor }

    private var heading: Double? { loc.heading ?? sweep.simHeading }
    private var info: AimInfo? { AimInfo(me: loc.location, repeater: sweep.site.marker, heading: heading) }
    private var target: Double? { guideToCenter ? sweep.bisect.center : info?.bearing }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                summary
                BeaconPolarChart(readings: sweep.readings, peak: sweep.peak?.level, bisect: sweep.bisect,
                                 markerBearing: info?.bearing, heading: heading)
                    .frame(maxWidth: 380).padding(.horizontal, 24)
                details
                guide
            }
            .padding(.vertical)
        }
        .navigationTitle("Resultado")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let csvURL {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: csvURL) { Label("Exportar barrido", systemImage: "square.and.arrow.up") }
                }
            }
        }
        .onAppear { guideToCenter = sweep.bisect.center != nil }
        .task { csvURL = writeCSV() }
    }

    // MARK: - Estimación

    @ViewBuilder private var summary: some View {
        if case .found(let center, _, _, _, _, _) = sweep.bisect {
            VStack(spacing: 6) {
                Text("Rumbo central").font(.subheadline).foregroundStyle(.secondary)
                Text(String(format: "%.1f° %@", center, Geo.cardinal(center)))
                    .font(.system(size: 52, weight: .bold, design: .rounded).monospacedDigit())
                if let m = info?.bearing {
                    let d = Geo.signedDelta(target: center, current: m)
                    let a: Agreement = abs(d) <= 5 ? .good : abs(d) <= 15 ? .fair : .poor
                    Label(String(format: "%+.1f° respecto al marcador (%.1f°)", d, m),
                          systemImage: a == .good ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(a == .good ? .green : a == .fair ? Theme.target : .red)
                    if a != .good {
                        Text("La señal llega por otro rumbo que el marcador: puede ser una reflexión, un obstáculo o el marcador mal situado. La decisión es tuya.")
                            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
                    }
                } else {
                    Text("Sin GPS: no se puede comparar con el marcador.").font(.footnote).foregroundStyle(.secondary)
                }
            }
        } else {
            ContentUnavailableView {
                Label("Aún no hay rumbo central", systemImage: "scope")
            } description: {
                Text(pendingText)
            }
        }
    }

    private var pendingText: String {
        switch sweep.bisect {
        case .needLeft: "Falta cruzar −3 dB por la izquierda: vuelve y barre más hacia la izquierda."
        case .needRight: "Falta cruzar −3 dB por la derecha: vuelve y barre más hacia la derecha."
        default: "Vuelve al barrido y gira la Yagi de lado a lado, más allá de donde la señal cae 3 dB."
        }
    }

    private var details: some View {
        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
            if case .found(_, let left, let right, let width, _, _) = sweep.bisect {
                row("Cruce izquierdo (−3 dB)", String(format: "%.1f°", left))
                row("Cruce derecho (−3 dB)", String(format: "%.1f°", right))
                row("Ancho del haz medido", String(format: "%.0f°", width))
            }
            if let p = sweep.peak {
                row("Máximo", String(format: "%.1f dBm a %.0f°", p.level, p.heading ?? 0))
            }
            row("Piso", sweep.floor.map { String(format: "%.1f dBm", $0) } ?? "—")
            if let p = sweep.peak, let f = sweep.floor { row("Margen sobre el piso", String(format: "%.0f dB", p.level - f)) }
            row("Lecturas válidas", "\(sweep.validCount) de \(sweep.readings.count)")
            row("Con tráfico ajeno", "\(sweep.dirty)")
            if let pitch = meanPitch { row("Inclinación media", String(format: "%+.1f°", pitch)) }
            if let info { row("Distancia al marcador", info.distanceText) }
            row("Frecuencia", "\(sweep.site.freq) MHz")
            if let t = sweep.startedAt { row("Inicio", t.formatted(date: .omitted, time: .standard)) }
        }
        .font(.body.monospacedDigit())
        .padding(.horizontal)
    }

    private var meanPitch: Double? {
        let p = sweep.readings.filter(\.valid).compactMap(\.pitch)
        return p.isEmpty ? nil : p.reduce(0, +) / Double(p.count)
    }

    // MARK: - Guía

    private var guide: some View {
        VStack(spacing: 12) {
            Picker("Guiar hacia", selection: $guideToCenter) {
                Text("Centro estimado").tag(true)
                Text("Marcador").tag(false)
            }
            .pickerStyle(.segmented)
            .disabled(sweep.bisect.center == nil)
            .padding(.horizontal)

            CompassView(heading: heading, target: target, tolerance: tolerance, onAlignedChange: { aligned = $0 })
                .frame(maxWidth: 300)
                .padding(.horizontal, 24)

            if let target, let heading {
                let d = Geo.signedDelta(target: target, current: heading)
                if aligned {
                    Label("Alineado: fija la Yagi", systemImage: "checkmark.circle.fill").font(.title2.bold()).foregroundStyle(.green)
                } else {
                    Label(String(format: "Gira %.0f°", abs(d)), systemImage: d > 0 ? "arrow.clockwise" : "arrow.counterclockwise")
                        .font(.title2.bold().monospacedDigit()).foregroundStyle(Theme.target)
                }
            }
        }
    }

    /// CSV del barrido (US5) en un archivo temporal para la hoja de compartir.
    private func writeCSV() -> URL? {
        guard !sweep.readings.isEmpty else { return nil }
        let name = BeaconCSV.fileName(site: sweep.site, started: sweep.startedAt ?? .now)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        let text = BeaconCSV.make(id: sweep.id, site: sweep.site, observer: loc.location?.coordinate, mapBearing: info?.bearing,
                                  floor: sweep.floor, readings: sweep.readings, bisect: sweep.bisect, fw: sweep.fw)
        return (try? text.write(to: url, atomically: true, encoding: .utf8)) != nil ? url : nil
    }

    private func row(_ k: String, _ v: String) -> some View {
        GridRow {
            Text(k).foregroundStyle(.secondary)
            Text(v).bold()
        }
    }
}
