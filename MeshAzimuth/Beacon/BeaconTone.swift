import AVFoundation
import os

/// Tono de "caza del zorro" (spec 005, US4; research R-8): la altura sube con el nivel relativo al máximo
/// retenido, de 400 Hz (20 dB o más por debajo) a 1200 Hz (en el máximo). Así se orienta sin mirar la pantalla.
final class BeaconTone {
    static let minHz = 400.0, maxHz = 1200.0, rangeDB = 20.0
    /// Cambio máximo de frecuencia por buffer de audio (≈ 10 ms): sin saltos que crujan.
    static let glideHz = 20.0
    static let amplitude = 0.25

    /// Frecuencia deseada; nil = silencio. Se escribe en el hilo principal y se lee en el de audio.
    private let target = OSAllocatedUnfairLock<Double?>(initialState: nil)
    private var engine: AVAudioEngine?

    /// Monótona en el nivel relativo (≤ 0 dB): 0 → maxHz, −rangeDB o menos → minHz.
    static func pitch(relativeDB: Double) -> Double {
        let x = min(max((relativeDB + rangeDB) / rangeDB, 0), 1)
        return minHz + (maxHz - minHz) * x
    }

    var isRunning: Bool { engine != nil }

    func start() {
        guard engine == nil else { return }
        let session = AVAudioSession.sharedInstance()
        // .playback suena aunque el interruptor de silencio esté puesto: el usuario lo activó a propósito.
        try? session.setCategory(.playback, options: .mixWithOthers)
        try? session.setActive(true)

        let e = AVAudioEngine()
        let rate = e.outputNode.outputFormat(forBus: 0).sampleRate
        guard rate > 0, let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else { return }
        let target = self.target
        var wanted: Double?, freq = Self.minHz, amp = 0.0, phase = 0.0
        let node = AVAudioSourceNode(format: format) { _, _, frames, abl in
            if let w = target.withLockIfAvailable({ $0 }) { wanted = w }     // sin bloquear el hilo de audio
            if let w = wanted { freq += max(-Self.glideHz, min(Self.glideHz, w - freq)) }
            let ampGoal = wanted == nil ? 0 : Self.amplitude
            let step = 2 * Double.pi * freq / rate
            let buffers = UnsafeMutableAudioBufferListPointer(abl)
            for i in 0..<Int(frames) {
                amp += (ampGoal - amp) * 0.002                               // fundido: sin chasquidos al callar
                let s = Float(sin(phase) * amp)
                phase += step
                if phase > 2 * .pi { phase -= 2 * .pi }
                for b in buffers { b.mData?.assumingMemoryBound(to: Float.self)[i] = s }
            }
            return noErr
        }
        e.attach(node)
        e.connect(node, to: e.mainMixerNode, format: format)
        do { try e.start(); engine = e } catch { e.stop() }
    }

    func stop() {
        engine?.stop()
        engine = nil
        target.withLock { $0 = nil }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// `relativeDB`: nivel actual − máximo retenido (≤ 0). nil = silencio (sin máximo, medidor parado).
    func update(relativeDB: Double?) {
        target.withLock { $0 = relativeDB.map(Self.pitch) }
    }
}
