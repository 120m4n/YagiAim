import MapKit
import SwiftUI

/// Botón propio de seguimiento de ubicación, con el estilo de la app.
/// Ciclo (como Apple Maps): sin seguir → seguir → seguir con rumbo → seguir.
/// Al arrastrar el mapa MapKit vuelve a «sin seguir» y el binding lo refleja.
struct TrackingButton: View {
    @Binding var mode: MKUserTrackingMode

    private var icon: String {
        switch mode {
        case .none: "location"
        case .follow: "location.fill"
        default: "location.north.line.fill"
        }
    }
    private var label: String {
        switch mode {
        case .none: "Seguir mi ubicación"
        case .follow: "Siguiendo mi ubicación. Tocar para seguir con rumbo"
        default: "Siguiendo con rumbo. Tocar para dejar de girar el mapa"
        }
    }

    var body: some View {
        Button {
            mode = mode == .none ? .follow : (mode == .follow ? .followWithHeading : .follow)
        } label: {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(mode == .none ? Color.white : Theme.accent)
                .frame(width: 44, height: 44)
                .background(Theme.navy.opacity(0.94), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10)
                    .stroke(Theme.accent.opacity(mode == .none ? 0.35 : 0.9), lineWidth: mode == .none ? 1 : 1.5))
        }
        .accessibilityLabel(label)
    }
}
