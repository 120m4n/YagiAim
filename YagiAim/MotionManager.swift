import CoreMotion
import Observation

/// Inclinación del boom. Con el teléfono plano sobre el boom (borde superior hacia el
/// director): 0° = horizontal, positivo = el frente apunta hacia arriba.
@Observable
final class MotionManager {
    private(set) var pitch: Double?
    @ObservationIgnored private let motion = CMMotionManager()

    func start() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 0.1
        motion.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in
            guard let self, let a = m?.attitude else { return }
            let p = a.pitch * 180 / .pi
            self.pitch = self.pitch.map { $0 + 0.3 * (p - $0) } ?? p // suavizado exponencial
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
        pitch = nil
    }
}
