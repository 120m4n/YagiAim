import Charts
import SwiftUI

/// Estado del enlace con el pinger y la calidad del último ping, con una sparkline del SNR de subida.
struct LinkCard: View {
    @Environment(PingerLink.self) private var link
    let onConnect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if link.isOperational {
                metrics
                sparkline
                Toggle(isOn: Binding(get: { link.live }, set: { $0 ? link.startLive() : link.stopLive() })) {
                    Text("En vivo").font(.subheadline.bold())
                    Text("1 ping cada 2 s").font(.caption).foregroundStyle(.secondary)
                }
                if let warning = visibleWarning {
                    Label(warning, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(Theme.target)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }

    // MARK: - Piezas

    @ViewBuilder private var header: some View {
        if link.isOperational {
            Label("Conectado · \(link.hash ?? "sin hash")", systemImage: "checkmark.circle.fill")
                .font(.headline).foregroundStyle(.green)
            if let d = link.device { Text(d.name + (d.fw.map { " · fw \($0)" } ?? "")).font(.caption).foregroundStyle(.secondary) }
            Button("Desconectar", role: .destructive) { link.disconnect() }.font(.footnote)
        } else if case .failed(let error) = link.state {
            Label(error.message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Theme.target)
            HStack {
                Button("Reintentar", action: onConnect)
                if error.opensSettings {
                    Button("Abrir Ajustes") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                }
            }.buttonStyle(.bordered).font(.footnote)
        } else if link.state == .connecting || link.state == .scanning {
            HStack(spacing: 10) { ProgressView(); Text("Conectando al pinger…") }
        } else {
            Button(action: onConnect) { Label("Conectar pinger", systemImage: "antenna.radiowaves.left.and.right") }
                .buttonStyle(.borderedProminent)
        }
    }

    private var metrics: some View {
        let r = link.last
        return Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 4) {
            GridRow {
                metric("SNR ↑", r?.snrUp.map { String(format: "%+.2f dB", $0) })
                metric("SNR ↓", r?.snrDn.map { String(format: "%+.2f dB", $0) })
            }
            GridRow {
                metric("RSSI ↓", r?.rssiDn.map { String(format: "%.1f dBm", $0) })
                metric("RTT", r?.rttMs.map { "\($0) ms" })
            }
            GridRow {
                metric("Pérdida", lossText)
                if let r, r.status != .ok { Text(statusText(r.status)).font(.footnote).foregroundStyle(Theme.target) } else { Color.clear.frame(height: 1) }
            }
        }
        .font(.body.monospacedDigit())
    }

    private func metric(_ title: String, _ value: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value ?? "—").bold()
        }
    }

    @ViewBuilder private var sparkline: some View {
        let points = link.history.elements.enumerated().compactMap { i, r in r.snrUp.map { (i, $0) } }
        if points.count >= 2 {
            Chart(points, id: \.0) { LineMark(x: .value("n", $0.0), y: .value("SNR ↑", $0.1)) }
                .chartXAxis(.hidden)
                .frame(height: 56)
                .foregroundStyle(Theme.accent)
        }
    }

    /// Pérdida sobre los últimos 30 pings respondidos (timeout / (ok + timeout)).
    private var lossText: String? {
        let answered = link.history.elements.filter { $0.status == .ok || $0.status == .timeout }
        guard !answered.isEmpty else { return nil }
        let lost = answered.filter { $0.status == .timeout }.count
        return "\(Int((100.0 * Double(lost) / Double(answered.count)).rounded())) %"
    }

    private func statusText(_ s: PingResult.Status) -> String {
        switch s {
        case .ok: ""
        case .timeout: "sin respuesta"
        case .busy: "canal ocupado"
        case .txerr: "error de TX"
        }
    }

    /// Solo los avisos que el usuario puede necesitar ver.
    private var visibleWarning: String? {
        guard let w = link.lastWarning else { return nil }
        if w.hasPrefix("duty_wait") { return "El pinger retrasó un envío por su límite de TX" }
        if w.hasPrefix("hash_collision") { return "Dos repetidores responden con el mismo hash" }
        return nil
    }
}
