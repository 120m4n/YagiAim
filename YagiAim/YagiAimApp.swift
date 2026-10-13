import SwiftUI

@main
struct YagiAimApp: App {
    @State private var location = LocationManager()
    @State private var store = RepeaterStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(location)
                .environment(store)
                .tint(Theme.accent)
        }
    }
}
