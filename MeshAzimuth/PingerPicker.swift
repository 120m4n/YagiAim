import SwiftUI

/// Escanea pingers BLE cercanos de un tipo (`YagiPinger-*` o catchers `PingPong-CA-*`) para el selector.
@MainActor @Observable
final class PingerScanner {
    private(set) var devices: [PingerDevice] = []
    private(set) var state: LinkState = .idle
    private(set) var timedOut = false

    @ObservationIgnored private var transport: BLELineTransport?
    @ObservationIgnored private var tasks: [Task<Void, Never>] = []

    func start(kind: PingerDevice.Kind) {
        stop()
        let t = BLELineTransport(deviceID: nil, kind: kind)
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
    var kind: PingerDevice.Kind = .yagi
    let onPick: (PingerDevice?) -> Void
    @State private var scanner = PingerScanner()
    @AppStorage("pinger.simulated") private var simulated = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if simulated {
                    Section {
                        Button { pick(nil) } label: {
                            Label(kind == .yagi ? "Pinger simulado" : "Baliza simulada", systemImage: "wand.and.stars")
                        }
                    } footer: {
                        Text(kind == .yagi
                             ? "Modo de depuración: genera mediciones sin hardware, según el rumbo y el azimut reales."
                             : "Modo de depuración: simula el catcher PingPong-CA escuchando una baliza CW situada cerca del marcador (a +4°). Sin brújula, el rumbo se mueve con un control.")
                    }
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
                                    if d.id == BLELineTransport.lastDeviceID(for: kind) { Text("último usado").font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                        if scanner.devices.isEmpty {
                            if scanner.timedOut {
                                Text("No se encontró ningún pinger. Comprueba que esté encendido y a menos de 2 m.")
                                    .font(.footnote).foregroundStyle(.secondary)
                                Button("Buscar de nuevo") { scanner.start(kind: kind) }
                            } else {
                                HStack(spacing: 12) { ProgressView(); Text("Buscando pingers cercanos…").foregroundStyle(.secondary) }
                            }
                        }
                    } header: { Text("Pingers cercanos") }
                }
            }
            .navigationTitle(kind == .yagi ? "Conectar pinger" : "Conectar pinger de baliza")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
        }
        .onAppear { scanner.start(kind: kind) }
        .onDisappear { scanner.stop() }
    }

    private func pick(_ d: PingerDevice?) {
        scanner.stop()
        dismiss()
        onPick(d)
    }
}
