import CoreMotion
import Observation

@Observable
final class MotionManager {
    private(set) var pitch: Double?
    /// Nivel de calibración del magnetómetro según CoreMotion; solo con `start(magnetic: true)` (recalibración).
    private(set) var magCalibration: CMMagneticFieldCalibrationAccuracy?
    @ObservationIgnored private let motion = CMMotionManager()
    @ObservationIgnored private var magnetic = false

    func start(magnetic: Bool = false) {
        guard motion.isDeviceMotionAvailable else { return }
        let frame: CMAttitudeReferenceFrame = magnetic ? .xArbitraryCorrectedZVertical : .xArbitraryZVertical
        guard CMMotionManager.availableAttitudeReferenceFrames().contains(frame) else { return }
        if motion.isDeviceMotionActive {
            guard magnetic != self.magnetic else { return }
            motion.stopDeviceMotionUpdates()
        }
        self.magnetic = magnetic
        magCalibration = nil
        motion.deviceMotionUpdateInterval = 0.1
        // Con el marco corregido CoreMotion usa el magnetómetro y rellena `magneticField.accuracy`; el pitch no cambia.
        motion.startDeviceMotionUpdates(using: frame, to: .main) { [weak self] m, _ in
            guard let self, let m else { return }
            let p = m.attitude.pitch * 180 / .pi
            self.pitch = self.pitch.map { $0 + 0.3 * (p - $0) } ?? p // suavizado exponencial
            if self.magnetic { self.magCalibration = m.magneticField.accuracy }
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
        pitch = nil
        magCalibration = nil
        magnetic = false
    }
}
