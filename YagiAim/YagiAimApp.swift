import SwiftUI

@main
struct YagiAimApp: App {
    @State private var location = LocationManager()
    @State private var store = RepeaterStore()
    @State private var motion = MotionManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(location)
                .environment(store)
                .environment(motion)
                .tint(Theme.accent)
        }
    }
}
