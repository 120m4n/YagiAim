import CoreHaptics
import UIKit

/// Vibración sostenida al alinear la antena: continua + golpes cada 0.5 s,
/// durante `duration` segundos (o hasta `stop()`). Pensada para sentirse con
/// guantes o en una torre, donde un solo golpe corto pasa desapercibido.
final class Haptics {
    static let shared = Haptics()

    private var engine: CHHapticEngine?
    private var player: CHHapticPatternPlayer?
    private var token = 0
    private var active = false

    func startAligned(duration: TimeInterval = 3) {
        guard !active else { return } // varias brújulas pueden disparar a la vez
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return
        }
        do {
            if engine == nil {
                let e = try CHHapticEngine()
                e.isAutoShutdownEnabled = true
                engine = e
            }
            var events = [CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [.init(parameterID: .hapticIntensity, value: 0.8),
                             .init(parameterID: .hapticSharpness, value: 0.4)],
                relativeTime: 0, duration: duration)]
            for t in stride(from: 0.0, to: duration, by: 0.5) {
                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [.init(parameterID: .hapticIntensity, value: 1),
                                 .init(parameterID: .hapticSharpness, value: 1)],
                    relativeTime: t))
            }
            try engine?.start()
            player = try engine?.makePlayer(with: CHHapticPattern(events: events, parameters: []))
            try player?.start(atTime: CHHapticTimeImmediate)
            active = true
            token += 1
            let mine = token
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
                if self?.token == mine { self?.active = false }
            }
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    func stop() {
        guard active else { return }
        active = false
        token += 1
        try? player?.stop(atTime: CHHapticTimeImmediate)
    }
}
