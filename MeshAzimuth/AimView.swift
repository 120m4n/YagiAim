import SwiftUI

// MARK: - Pantalla de apuntamiento a pantalla completa

struct AimView: View {
    @Environment(LocationManager.self) private var loc
    @Environment(RepeaterStore.self) private var store
    @Environment(MotionManager.self) private var motion
    @Environment(PingerLink.self) private var link
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @AppStorage("tolerance") private var tolerance = 3.0
    @State private var aligned = false
    @State private var confirmCalibrate = false

    var body: some View {
        NavigationStack {
            ScrollView {
            VStack(spacing: 20) {
                if let r = store.selected {
                    let info = AimInfo(me: loc.location, repeater: r, heading: loc.heading)

                    CompassView(heading: loc.heading, target: info?.bearing, tolerance: tolerance,
                                onAlignedChange: { aligned = $0 })
                        .padding(.horizontal, 24)

                    if let info {
                        instruction(info)
                        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                            row("Azimut verdadero", String(format: "%.1f° %@", info.bearing, Geo.cardinal(info.bearing)))
                            row("Rumbo teléfono", loc.heading.map { String(format: "%.1f°", $0) } ?? "—")
                            row("Distancia", info.distanceText)
                            if let e = info.elevation { row("Elevación objetivo", String(format: "%+.1f°", e)) }
                            if let p = motion.pitch {
                                row("Inclinación boom", String(format: "%+.1f°", p))
                                if let e = info.elevation {
                                    row("Ajuste vertical", String(format: "%@ %.1f°", e - p >= 0 ? "Sube" : "Baja", abs(e - p)))
                                }
                            }
                            row("Precisión brújula", accuracyText)
                            row("Precisión GPS", loc.location.map { String(format: "±%.0f m", $0.horizontalAccuracy) } ?? "—")
                        }
                        .font(.body.monospacedDigit())
                    } else {
                        LocationDeniedBanner()
                        ProgressView("Obteniendo ubicación…")
                    }

                    if loc.usingMagneticFallback {
                        Label("Usando norte magnético (sin GPS). Declinación no corregida.", systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(Theme.target)
                    }

                    VStack(alignment: .leading) {
                        Text("Tolerancia de alineación: ±\(Int(tolerance))°").font(.footnote)
                        Slider(value: $tolerance, in: 1...15, step: 1)
                    }
                    .padding(.horizontal)

                    if let info {
                        VStack(spacing: 6) {
                            HStack {
                                Button("Calibrar boom") { confirmCalibrate = true }
                                    .disabled(loc.rawHeading == nil)
                                if loc.headingOffset != 0 {
                                    Button("Restablecer (\(String(format: "%+.1f", loc.headingOffset))°)") { loc.headingOffset = 0 }
                                }
                            }
                            .buttonStyle(.bordered)
                            .font(.footnote)
                        }
                        .confirmationDialog("¿La Yagi está apuntando exactamente al repetidor?",
                                            isPresented: $confirmCalibrate, titleVisibility: .visible) {
                            Button("Sí, calibrar") { loc.calibrate(toBearing: info.bearing) }
                        } message: {
                            Text("Se corregirá la diferencia entre el teléfono y el boom usando este azimut como referencia.")
                        }
                    }

                    PingerSection(repeater: r, bearing: info?.bearing)

                    Text("Sostén el teléfono plano sobre el boom, con la parte superior hacia el director. Aléjate de metal y del cable coaxial.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Spacer(minLength: 0)
            }
            .padding(.top)
            }
            .navigationTitle(store.selected?.name ?? "Apuntar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } }
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; motion.start() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false; motion.stop(); link.disconnect() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { link.stopLive() } }   // sin modo background
    }

    private var accuracyText: String {
        loc.headingAccuracy < 0 ? "sin calibrar" : String(format: "±%.0f°", loc.headingAccuracy)
    }

    @ViewBuilder private func instruction(_ info: AimInfo) -> some View {
        if let d = info.delta {
            if aligned {
                Label("Alineado", systemImage: "checkmark.circle.fill")
                    .font(.largeTitle.bold()).foregroundStyle(.green)
            } else {
                Label(String(format: "Gira %.0f°", abs(d)),
                      systemImage: d > 0 ? "arrow.clockwise" : "arrow.counterclockwise")
                    .font(.largeTitle.bold().monospacedDigit())
                    .foregroundStyle(Theme.target)
                    .contentTransition(.numericText())
            }
        } else {
            Text("Brújula no disponible").font(.title2).foregroundStyle(.secondary)
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        GridRow {
            Text(k).foregroundStyle(.secondary)
            Text(v).bold()
        }
    }
}
