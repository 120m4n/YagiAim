import SwiftUI

/// Sesión actual e historial del repetidor.
struct SessionSheet: View {
    let repeater: Repeater
    @Environment(SessionRecorder.self) private var recorder
    @Environment(\.dismiss) private var dismiss
    @State private var past: [Session] = []

    var body: some View {
        NavigationStack {
            List {
                if let current = recorder.current {
                    Section("Sesión actual") {
                        NavigationLink { SessionView(session: current) } label: { row(current) }
                        Button("Empezar una sesión nueva") { recorder.startSession(); dismiss() }
                    }
                } else {
                    Section { Text("Aún no hay lecturas. Toca «Medir aquí» con la antena quieta.").foregroundStyle(.secondary) }
                }
                if !past.isEmpty {
                    Section("Anteriores") {
                        ForEach(past) { s in NavigationLink { SessionView(session: s) } label: { row(s) } }
                    }
                }
            }
            .navigationTitle(repeater.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { dismiss() } } }
            .onAppear { past = SessionStore().sessions(forRepeater: repeater.id).filter { $0.id != recorder.current?.id } }
        }
    }

    private func row(_ s: Session) -> some View {
        VStack(alignment: .leading) {
            Text(s.started.formatted(date: .abbreviated, time: .shortened))
            Text("\(s.readings.count) lecturas · \(s.samples.count) muestras").font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// Lecturas de una sesión y exportación a CSV.
struct SessionView: View {
    let session: Session
    @State private var csvURL: URL?

    var body: some View {
        List {
            Section {
                ForEach(session.readings) { r in
                    HStack {
                        Text("#\(r.index)").bold().frame(width: 34, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line1(r)).font(.callout.monospacedDigit())
                            Text(line2(r)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if r.needsRepeat { Image(systemName: "arrow.counterclockwise").foregroundStyle(Theme.target) }
                    }
                }
            } header: { Text("Lecturas") } footer: {
                Text("Δ = rumbo del teléfono respecto al azimut (positivo: falta girar a la derecha). ↺ = repetir: menos de 3 muestras estables.")
            }
            if let csvURL {
                Section { ShareLink(item: csvURL) { Label("Exportar CSV", systemImage: "square.and.arrow.up") } }
            }
        }
        .navigationTitle(session.started.formatted(date: .abbreviated, time: .shortened))
        .navigationBarTitleDisplayMode(.inline)
        .task { csvURL = writeCSV() }
    }

    private func line1(_ r: Reading) -> String {
        [r.meanDelta.map { String(format: "Δ %+.1f°", $0) } ?? "Δ —",
         r.medSnrUp.map { String(format: "SNR↑ %+.2f", $0) } ?? "SNR↑ —"].joined(separator: "   ")
    }

    private func line2(_ r: Reading) -> String {
        [r.medSnrDn.map { String(format: "SNR↓ %+.2f", $0) } ?? "SNR↓ —",
         r.lossPct.map { "pérdida \($0) %" } ?? "pérdida —",
         "\(r.stableCount) estables"].joined(separator: " · ")
    }

    private func writeCSV() -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(SessionCSV.fileName(for: session))
        return (try? SessionCSV.make(session).write(to: url, atomically: true, encoding: .utf8)) != nil ? url : nil
    }
}
