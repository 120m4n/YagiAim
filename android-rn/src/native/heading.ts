// Contrato TS del módulo Kotlin `MeshHeading` (modules/heading) — PM-05, PM-06, PM-07.
import { requireNativeModule } from 'expo-modules-core';
import type { SensorSample } from '../core/headingFusion';

interface NativeSample {
  tNs: number;
  g: [number, number, number];
  mc: [number, number, number];
  mu: [number, number, number];
  rv?: number;
}

interface HeadingNative {
  isAvailable(): boolean;
  startSamples(periodMs: number): void;
  stopSamples(): void;
  startPitch(intervalMs: number): void;
  stopPitch(): void;
  startDiagnostic(label: string): string;
  stopDiagnostic(): void;
  addListener(name: 'onSample', cb: (e: NativeSample) => void): { remove(): void };
  addListener(name: 'onPitch', cb: (e: { pitch: number }) => void): { remove(): void };
}

let mod: HeadingNative | undefined;
const native = (): HeadingNative => (mod ??= requireNativeModule<HeadingNative>('MeshHeading'));

export const headingAvailable = (): boolean => native().isAvailable();

/** Muestras de sensores promediadas cada `periodMs` (20 Hz por defecto) para la fusión de rumbo. */
export function startSamples(onSample: (s: SensorSample) => void, periodMs = 50): () => void {
  const sub = native().addListener('onSample', (e) =>
    onSample({ tNs: e.tNs, g: e.g, mDriver: e.mc, mUncal: e.mu, ...(e.rv !== undefined && { rvAzimuth: e.rv }) }),
  );
  native().startSamples(periodMs);
  return () => {
    sub.remove();
    native().stopSamples();
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

/** FASE 0 (temporal): graba todas las fuentes de orientación en un CSV; devuelve la ruta del archivo. */
export const startDiagnostic = (label: string): string => native().startDiagnostic(label);
export const stopDiagnostic = (): void => native().stopDiagnostic();
