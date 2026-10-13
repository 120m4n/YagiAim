import SwiftUI

/// Aviso cuando el permiso de ubicación está denegado o restringido.
struct LocationDeniedBanner: View {
    @Environment(LocationManager.self) private var loc

    var body: some View {
        if loc.authorization == .denied || loc.authorization == .restricted {
            VStack(spacing: 6) {
                Label("Sin permiso de ubicación", systemImage: "location.slash")
                    .font(.footnote.bold())
                Text("Sin GPS no se puede calcular el azimut al repetidor.")
                    .font(.caption)
                Button("Abrir Ajustes") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
            .multilineTextAlignment(.center)
            .padding(10)
            .foregroundStyle(.white)
            .background(Theme.navy.opacity(0.94), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.target.opacity(0.7), lineWidth: 1))
            .padding(.horizontal)
        }
    }
}
