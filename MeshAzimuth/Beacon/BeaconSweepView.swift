import SwiftUI

/// El ejercicio: conectar el pinger de baliza, medir el piso y barrer el lóbulo mientras se ve el nivel,
/// el máximo retenido, el gráfico polar y el estado de la bisección.
struct BeaconSweepView: View {
    let link: PingerLink
    @Environment(LocationManager.self) private var loc
    @Environment(MotionManager.self) private var motion
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("pinger.simulated") private var simulated = false
    @State private var sweep: BeaconSweep
    @State private var showPicker = false
    @State private var showResult = false
    @State private var tone = BeaconTone()
    @State private var toneOn = false          // apagado por defecto (FR-027)

    init(site: BeaconSite, link: PingerLink) {
        self.link = link
        _sweep = State(initialValue: BeaconSweep(site: site))
    }

    private var heading: Double? { loc.heading ?? sweep.simHeading }
    private var markerBearing: Double? { loc.location.map { Geo.bearing(from: $0.coordinate, to: sweep.site.coordinate) } }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                BeaconLinkCard(link: link) { showPicker = true }
                if link.isOperational {
                    meter
                    BeaconPolarChart(readings: sweep.readings, peak: sweep.peak?.level, bisect: sweep.bisect,
                                     markerBearing: markerBearing, heading: heading)
                        .frame(maxWidth: 380)
                        .padding(.horizontal, 24)
                    legend
                    bisectStatus
                    controls
                    Toggle(isOn: $toneOn) {
                        Label("Tono", systemImage: "speaker.wave.2")
                        Text("Más agudo cuanto más cerca del máximo, para orientar sin mirar.").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                    if simulated && loc.heading == nil { simHeadingSlider }
                    ForEach(sweep.warnings, id: \.self) { w in
                        Label(w, systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(Theme.target)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal)
                    }
                }
                Text("Barre despacio (unos 20° por segundo) de lado a lado, más allá de donde la señal cae 3 dB. Misma postura en todo el barrido y el brazo fuera del haz. El pinger va pegado al boom.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
            }
            .padding(.vertical)
        }
        .navigationTitle(sweep.site.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showPicker) {
            PingerPicker(kind: .pingPong) { d in Task { await link.connect(device: d, hash: nil) } }
        }
        .navigationDestination(isPresented: $showResult) { BeaconResultView(sweep: sweep) }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; motion.start() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false; sweep.pause(link: link); toneOn = false }
        .onChange(of: scenePhase) { _, p in if p != .active { sweep.pause(link: link); toneOn = false } }   // sin modo background
        .onChange(of: toneOn) { _, on in on ? tone.start() : tone.stop(); updateTone() }
        .onChange(of: sweep.last) { updateTone() }
        .onChange(of: sweep.phase) { updateTone() }
        .onChange(of: heading, initial: true) { _, h in link.simInputs.heading = h }
        .onChange(of: markerBearing, initial: true) { _, b in link.simInputs.target = b }
    }

    /// Altura según el nivel relativo al máximo; silencio sin máximo o con el medidor parado.
    private func updateTone() {
        guard toneOn, sweep.phase == .metering, let peak = sweep.peak, let last = sweep.last else {
            return tone.update(relativeDB: nil)
        }
        tone.update(relativeDB: last.level - peak.level)
    }

    // MARK: - Medidor

    private var meter: some View {
        VStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(sweep.last.map { String(format: "%.1f", $0.level) } ?? "—")
                    .font(.system(size: 64, weight: .bold, design: .rounded).monospacedDigit())
                    .contentTransition(.numericText())
                    .foregroundStyle(sweep.last?.valid == false ? .secondary : .primary)
                Text("dBm").font(.title3).foregroundStyle(.secondary)
            }

            if let peak = sweep.peak, let last = sweep.last {
                let below = peak.level - last.level
                VStack(spacing: 2) {
                    ProgressView(value: max(0, 1 - below / 20))
                        .tint(below <= 3 ? .green : Theme.accent)
                    Text(String(format: "%.1f dB bajo el máximo", below)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                .padding(.horizontal)
            }

            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 6) {
                GridRow {
                    cell("Máximo", sweep.peak.map { String(format: "%.1f dBm · %.0f°", $0.level, $0.heading ?? 0) })
                    cell("Piso", sweep.floor.map { String(format: "%.1f dBm", $0) })
                }
                GridRow {
                    cell("Rumbo", heading.map { String(format: "%.1f° %@", $0, Geo.cardinal($0)) })
                    cell("Marcador", markerBearing.map { String(format: "%.1f°", $0) })
                }
                GridRow {
                    cell("Lecturas válidas", "\(sweep.validCount) / \(sweep.readings.count)")
                    cell("Tráfico ajeno", "\(sweep.dirty)")
                }
                GridRow {
                    cell("Ritmo", rateText)
                    cell("Frecuencia", "\(sweep.site.freq) MHz")
                }
            }
            .font(.body.monospacedDigit())
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }

    /// Lecturas por segundo en los últimos 3 s (SC-002: ≥ 5).
    private var rateText: String? {
        guard sweep.phase == .metering else { return nil }
        let recent = sweep.readings.reversed().prefix { $0.t > .now - 3 }.count
        return String(format: "%.1f /s", Double(recent) / 3)
    }

    private func cell(_ title: String, _ value: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value ?? "—").bold()
        }
    }

    private var legend: some View {
        HStack(spacing: 14) {
            legendItem(Theme.accent, "lectura")
            legendItem(Theme.target, "marcador")
            legendItem(.green, "−3 dB / centro")
            legendItem(.primary, "rumbo")
        }
        .font(.caption2).foregroundStyle(.secondary)
    }

    private func legendItem(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Circle().fill(c).frame(width: 7, height: 7); Text(t) }
    }

    // MARK: - Bisección y controles

    @ViewBuilder private var bisectStatus: some View {
        Group {
            switch sweep.bisect {
            case .notEnough:
                Label("Barre de lado a lado, pasando el máximo", systemImage: "arrow.left.and.right")
            case .needLeft:
                Label("Barre más hacia la izquierda", systemImage: "arrow.counterclockwise").foregroundStyle(Theme.target)
            case .needRight:
                Label("Barre más hacia la derecha", systemImage: "arrow.clockwise").foregroundStyle(Theme.target)
            case .found(let center, _, _, let width, _, _):
                VStack(spacing: 2) {
                    Label(String(format: "Centro %.1f° · haz %.0f°", center, width), systemImage: "scope")
                        .foregroundStyle(.green)
                    if let m = markerBearing {
                        Text(String(format: "%+.1f° respecto al marcador", Geo.signedDelta(target: center, current: m)))
                            .font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .font(.headline.monospacedDigit())
    }

    @ViewBuilder private var controls: some View {
        HStack {
            switch sweep.phase {
            case .floor:
                ProgressView(); Text("Midiendo el piso…").foregroundStyle(.secondary)
            case .metering:
                Button { sweep.pause(link: link) } label: { Label("Pausar", systemImage: "pause.fill") }
                    .buttonStyle(.bordered)
            case .idle, .paused, .failed:
                Button { Task { await sweep.start(link: link, pose: pose) } } label: {
                    Label(sweep.phase == .idle ? "Empezar barrido" : "Continuar", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            }
            Button("Nuevo barrido") { sweep.reset() }
                .buttonStyle(.bordered)
                .disabled(sweep.readings.isEmpty)
            Button { showResult = true } label: { Label("Resultado", systemImage: "chart.pie") }
                .buttonStyle(.bordered)
                .disabled(sweep.peak == nil)
        }
        if case .failed(let msg) = sweep.phase {
            Label(msg, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(Theme.target)
        }
    }

    /// Rumbo, precisión e inclinación al recibir cada `M,` (research R-4).
    private var pose: @MainActor () -> BeaconPose {
        { [loc, motion, sweep] in
            if let h = loc.heading { return BeaconPose(heading: h, headingAccuracy: loc.headingAccuracy, pitch: motion.pitch) }
            return BeaconPose(heading: sweep.simHeading, headingAccuracy: sweep.simHeading == nil ? -1 : 5, pitch: motion.pitch)
        }
    }

    /// Solo depuración: en el simulador de iOS no hay brújula; este control hace de rumbo.
    private var simHeadingSlider: some View {
        VStack(alignment: .leading) {
            Text("Rumbo simulado: \(heading.map { String(format: "%.0f°", $0) } ?? "—")").font(.footnote)
            Slider(value: Binding(get: { sweep.simHeading ?? markerBearing ?? 0 },
                                  set: { sweep.simHeading = $0 }), in: 0...359.9)
        }
        .padding(.horizontal)
    }
}

/// Estado del enlace con el pinger de baliza (sin métricas TRACE).
struct BeaconLinkCard: View {
    let link: PingerLink
    let onConnect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if link.isOperational {
                HStack {
                    Label("Pinger de baliza conectado", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(.green)
                    Spacer()
                    Button("Desconectar", role: .destructive) { link.disconnect() }.font(.footnote)
                }
                if let d = link.device { Text(d.name + (d.fw.map { " · fw \($0)" } ?? "")).font(.caption).foregroundStyle(.secondary) }
            } else if case .failed(let error) = link.state {
                Label(error.message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Theme.target)
                HStack {
                    Button("Reintentar", action: onConnect)
                    if error.opensSettings {
                        Button("Abrir Ajustes") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                }
                .buttonStyle(.bordered).font(.footnote)
            } else if link.state == .connecting || link.state == .scanning {
                HStack(spacing: 10) { ProgressView(); Text("Conectando al pinger…") }
            } else {
                Button(action: onConnect) { Label("Conectar catcher PingPong-CA", systemImage: "antenna.radiowaves.left.and.right") }
                    .buttonStyle(.borderedProminent)
                Text("Necesita firmware \(PingerLink.minBeaconFirmware) o posterior.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }
}
