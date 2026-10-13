import SwiftUI

/// Acerca de: versión, desarrollador y proyectos relacionados.
struct AboutView: View {
    @Environment(\.dismiss) private var dismiss

    private var appName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "YagiAim"
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
        }
    }
}
