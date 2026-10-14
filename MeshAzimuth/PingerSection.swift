import SwiftUI

/// Bloque del pinger en la pantalla de apuntamiento: conexión, enlace en vivo y "Medir aquí".
struct PingerSection: View {
    let repeater: Repeater
    let bearing: Double?

    @Environment(PingerLink.self) private var link
    @Environment(SessionRecorder.self) private var recorder
    @Environment(LocationManager.self) private var loc
    @State private var showPicker = false
    @State private var showSessions = false
    @State private var lastReading: Reading?
    @State private var problem: String?

    var body: some View {
        VStack(spacing: 12) {
            LinkCard(onConnect: { showPicker = true })

            if repeater.hashPrefix == nil {
                Label("Añade el prefijo hash de «\(repeater.name)» (editar repetidor) para medir el enlace.", systemImage: "info.circle")
                    .font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            }

            if link.isOperational {
                measureControls
            }
        }
        .sheet(isPresented: $showPicker) {
            PingerPicker { device in
                Task { await link.connect(device: device, hash: repeater.hashPrefix) }
            }
        }
        .sheet(isPresented: $showSessions) { SessionSheet(repeater: repeater) }
        .onChange(of: loc.heading) { _, h in link.simInputs.heading = h }
        .onChange(of: bearing, initial: true) { _, b in link.simInputs.target = b }
        .onChange(of: repeater.hashPrefix) { _, new in
            if link.isOperational, let new { Task { try? await link.configure(hash: new) } }
        }
    }

    private var canMeasure: Bool {
        link.isOperational && !recorder.measuring && repeater.hashPrefix != nil && loc.heading != nil
    }

    private var measureControls: some View {
        VStack(spacing: 8) {
            Button(action: measure) {
                if recorder.measuring {
                    Label("Midiendo \(recorder.done)/\(recorder.total)…", systemImage: "waveform")
                } else {
                    Label("Medir aquí", systemImage: "scope")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canMeasure)

            if !SessionRules.headingIsValid(loc.headingAccuracy) {
                Label("Calibra la brújula antes de medir (precisión \(loc.headingAccuracy < 0 ? "sin calibrar" : String(format: "±%.0f°", loc.headingAccuracy))).",
                      systemImage: "location.north.line")
                    .font(.footnote).foregroundStyle(Theme.target).multilineTextAlignment(.center)
            }
            if let problem { Text(problem).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }

            if let r = lastReading { readingSummary(r) }

            Button { showSessions = true } label: {
                Label("Sesión · \(recorder.current?.readings.count ?? 0) lecturas", systemImage: "list.bullet.rectangle")
            }
            .font(.footnote)
        }
        .padding(.horizontal)
    }

    private func readingSummary(_ r: Reading) -> some View {
        VStack(spacing: 2) {
            Text("Lectura \(r.index)").font(.caption).foregroundStyle(.secondary)
            Text([r.meanDelta.map { String(format: "Δ %+.1f°", $0) },
                  r.medSnrUp.map { String(format: "SNR↑ %+.2f dB", $0) },
                  r.lossPct.map { "pérdida \($0) %" }].compactMap { $0 }.joined(separator: " · "))
                .font(.callout.monospacedDigit().bold())
            if r.needsRepeat {
                Label("Repetir: solo \(r.stableCount) muestras estables (mantén el teléfono quieto)", systemImage: "arrow.counterclockwise")
                    .font(.footnote).foregroundStyle(Theme.target)
            }
        }
    }

    private func measure() {
        problem = nil
        Task {
            do {
                let reading = try await recorder.measureHere(link: link, location: loc, repeater: repeater)
                lastReading = reading
                UINotificationFeedbackGenerator().notificationOccurred(reading.needsRepeat ? .warning : .success)
            } catch let e as SessionRecorder.MeasureError {
                problem = switch e {
                case .notReady: "El pinger no está conectado."
                case .noHash: "Falta el prefijo hash del repetidor."
                case .needsCalibration: "Calibra la brújula y vuelve a intentar."
                case .noLocation: "Aún no hay ubicación GPS."
                case .measuring: nil
                }
            } catch {
                problem = (error as? LinkError)?.message ?? "No se pudo medir: \(error.localizedDescription)"
            }
        }
    }
}
