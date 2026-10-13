import SwiftUI

/// Acerca de: versión, desarrollador y proyectos relacionados.
struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var cacheBytes = CachedTileOverlay.cache.currentDiskUsage
    @State private var confirmClear = false
    @State private var showGuide = false

    private var appName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "MeshAzimuth"
    }
    private var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 8) {
                        Image(systemName: "scope")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(Theme.target)
                        Text(appName).font(.title2.bold())
                        Text("Apunta tu Yagi al repetidor MeshCore")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                Section("Aplicación") {
                    LabeledContent("Versión", value: version)
                    Button { showGuide = true } label: { Label("Ver guía de uso", systemImage: "questionmark.circle") }
                }

                Section {
                    LabeledContent("Caché de mapas",
                                   value: ByteCountFormatter.string(fromByteCount: Int64(cacheBytes), countStyle: .file))
                    Button("Borrar caché de mapas", role: .destructive) { confirmClear = true }
                } header: { Text("Almacenamiento") } footer: {
                    Text("Guarda solo las teselas que has visto (máx. 500 MB). Para usar una zona sin red, recórrela antes con conexión.")
                }

                Section("Desarrollador") {
                    LabeledContent("Indicativo", value: "HJ7RMN")
                    Link(destination: URL(string: "https://github.com/120m4n")!) {
                        Label("github.com/120m4n", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                }

                Section {
                    Link(destination: URL(string: "https://meshcore-bga.sidis-ingenieria.com")!) {
                        VStack(alignment: .leading, spacing: 2) {
                            Label("MeshCore Santander", systemImage: "map")
                            Text("Mapa de cobertura MeshCore: reportes de conectividad y simulación de línea de vista (LOS) 360°.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } header: { Text("Proyectos relacionados") }
            }
            .navigationTitle("Acerca de")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } } }
            .fullScreenCover(isPresented: $showGuide) { OnboardingView() }
            .confirmationDialog("¿Borrar la caché de mapas?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Borrar", role: .destructive) {
                    CachedTileOverlay.cache.removeAllCachedResponses()
                    cacheBytes = CachedTileOverlay.cache.currentDiskUsage
                }
            }
        }
    }
}
