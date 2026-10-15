// Contrato TS del módulo Kotlin `MeshHeading` (modules/heading) — PM-05, PM-06, PM-07.
import { requireNativeModule } from 'expo-modules-core';

export interface NativeHeadingEvent {
  azimuth: number;
  usingMagnetic: boolean;
  /** Grados; < 0 = sin calibrar. */
  accuracy: number;
}

interface HeadingNative {
  isAvailable(): boolean;
  startHeading(): void;
  stopHeading(): void;
  startPitch(intervalMs: number): void;
  stopPitch(): void;
  addListener(name: 'onHeading', cb: (e: NativeHeadingEvent) => void): { remove(): void };
  addListener(name: 'onPitch', cb: (e: { pitch: number }) => void): { remove(): void };
}

let mod: HeadingNative | undefined;
const native = (): HeadingNative => (mod ??= requireNativeModule<HeadingNative>('MeshHeading'));

export const headingAvailable = (): boolean => native().isAvailable();

export function startHeading(onHeading: (e: NativeHeadingEvent) => void): () => void {
  const sub = native().addListener('onHeading', onHeading);
  native().startHeading();
  return () => {
    sub.remove();
    native().stopHeading();
  };
}

/** Pitch crudo (grados, positivo = el frente sube) a `intervalMs`. */
export function startPitch(onPitch: (pitchDeg: number) => void, intervalMs = 100): () => void {
  const sub = native().addListener('onPitch', (e) => onPitch(e.pitch));
  native().startPitch(intervalMs);
  return () => {
    sub.remove();
    native().stopPitch();
  };
}
