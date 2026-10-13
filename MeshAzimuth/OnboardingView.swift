import SwiftUI

/// Guía de 3 pantallas: primer arranque y «Ver guía» en Acerca de.
struct OnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0

    private let pages: [(icon: String, title: String, text: String)] = [
        ("mappin.and.ellipse", "Marca el repetidor",
         "Toca el mapa donde está el repetidor MeshCore. Puedes guardar varios, con nombre y altitud opcional para calcular la elevación."),
        ("iphone.gen3", "Coloca el teléfono",
         "Ponlo plano sobre el boom, con el borde superior hacia el director. Aléjalo de mástiles, coaxial y del imán del rotor. Si la precisión de la brújula pasa de ±15°, muévelo en forma de ocho."),
        ("scope", "Gira hasta el verde",
         "La aguja naranja apunta al repetidor. Al alinearte se pone verde y vibra 3 segundos. Ajusta el último tramo por RSSI/SNR del companion."),
    ]

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                ForEach(pages.indices, id: \.self) { i in
                    VStack(spacing: 20) {
                        Image(systemName: pages[i].icon)
                            .font(.system(size: 64, weight: .semibold))
                            .foregroundStyle(Theme.target)
                        Text(pages[i].title).font(.title.bold())
                        Text(pages[i].text)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    .padding(32)
                    .tag(i)
                }
            }
            .tabViewStyle(.page)

            Button(page == pages.count - 1 ? "Empezar" : "Siguiente") {
                if page == pages.count - 1 { dismiss() } else { withAnimation { page += 1 } }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.bottom, 32)
        }
        .foregroundStyle(.white)
        .background(Theme.navy.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .interactiveDismissDisabled()
    }
}
