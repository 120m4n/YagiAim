import SwiftUI

/// Escanea pingers BLE cercanos (`YagiPinger-*`) para el selector.
@MainActor @Observable
final class PingerScanner {
    private(set) var devices: [PingerDevice] = []
    private(set) var state: LinkState = .idle
    private(set) var timedOut = false

    @ObservationIgnored private var transport: BLELineTransport?
    @ObservationIgnored private var tasks: [Task<Void, Never>] = []

    func start() {
        stop()
        let t = BLELineTransport(deviceID: nil)
        transport = t
        timedOut = false
        tasks = [
            Task { [weak self] in for await d in t.devices { self?.devices = d } },
            Task { [weak self] in for await s in t.states { self?.state = s } },
            Task { [weak self] in try? await Task.sleep(for: .seconds(10)); self?.timedOut = true },   // nunca un spinner infinito
        ]
        t.startScan()
    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks = []
        transport?.close()
        transport = nil
    }
}

/// Lista de pingers cercanos. `onPick(nil)` = pinger simulado (depuración).
struct PingerPicker: View {
    let onPick: (PingerDevice?) -> Void
    @State private var scanner = PingerScanner()
    @AppStorage("pinger.simulated") private var simulated = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if simulated {
                    Section {
                        Button { pick(nil) } label: { Label("Pinger simulado", systemImage: "wand.and.stars") }
                    } footer: { Text("Modo de depuración: genera mediciones sin hardware, según el rumbo y el azimut reales.") }
                }

                if let error = scanner.state.failure {
                    Section {
                        Label(error.message, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.target)
                        if error.opensSettings {
                            Button("Abrir Ajustes") {
                                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                            }
                        }
                    }
                } else {
                    Section {
                        ForEach(scanner.devices) { d in
                            Button { pick(d) } label: {
                                HStack {
                                    Label(d.name, systemImage: "antenna.radiowaves.left.and.right")
                                    Spacer()
                                    if d.id == BLELineTransport.lastDeviceID { Text("último usado").font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                        if scanner.devices.isEmpty {
                            if scanner.timedOut {
                                Text("No se encontró ningún pinger. Comprueba que esté encendido y a menos de 2 m.")
                                    .font(.footnote).foregroundStyle(.secondary)
                                Button("Buscar de nuevo") { scanner.start() }
                            } else {
                                HStack(spacing: 12) { ProgressView(); Text("Buscando pingers cercanos…").foregroundStyle(.secondary) }
                            }
                        }
                    } header: { Text("Pingers cercanos") }
                }
            }
            .navigationTitle("Conectar pinger")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
        }
        .onAppear { scanner.start() }
        .onDisappear { scanner.stop() }
    }

    private func pick(_ d: PingerDevice?) {
        scanner.stop()
        dismiss()
        onPick(d)
    }
}
