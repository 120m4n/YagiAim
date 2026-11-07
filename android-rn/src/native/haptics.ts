// Contrato TS del módulo Kotlin `MeshHaptics` (modules/haptics) — PM-10.
import { requireNativeModule } from 'expo-modules-core';

export interface HapticsDriver {
  /** `Vibrator.hasAmplitudeControl()`. */
  hasAmplitudeControl(): boolean;
  /** `VibrationEffect.createWaveform(timings, amplitudes, -1)`: cada paso con su amplitud (0–255). */
  vibrateWaveform(timingsMs: number[], amplitudes: number[]): void;
  cancel(): void;
  /** Equivalente de `UINotificationFeedbackGenerator.notificationOccurred`. */
  notify(kind: 'success' | 'warning'): void;
}

export const nativeHaptics = (): HapticsDriver => requireNativeModule<HapticsDriver>('MeshHaptics');
