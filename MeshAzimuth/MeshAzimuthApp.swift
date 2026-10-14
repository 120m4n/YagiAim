import SwiftUI

@main
struct MeshAzimuthApp: App {
    @State private var location = LocationManager()
    @State private var store = RepeaterStore()
    @State private var motion = MotionManager()
    @State private var link: PingerLink
    @State private var recorder = SessionRecorder()

    init() {
        let inputs = SimInputs()
        // El pinger simulado (Acerca de → Depuración) o el BLE real, según el ajuste al momento de conectar.
        _link = State(initialValue: PingerLink(simInputs: inputs) { device -> LineTransport in
            if UserDefaults.standard.bool(forKey: "pinger.simulated") {
                return SimulatedPinger(heading: { inputs.heading }, targetBearing: { inputs.target })
            }
            return BLELineTransport(deviceID: device?.id ?? BLELineTransport.lastDeviceID)
        })
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(location)
                .environment(store)
                .environment(motion)
                .environment(link)
                .environment(recorder)
                .tint(Theme.accent)
        }
    }
}
