// MotionManager.swift / PM-07 — inclinación del boom: pitch en grados, positivo = el frente sube, 10 Hz, EMA 0.3.
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface PitchSource {
  readonly available: boolean;
  /** Entrega el pitch crudo (grados) a 10 Hz; devuelve la baja. */
  start(onPitch: (pitchDeg: number) => void): () => void;
}

export class MotionStore {
  readonly store: StoreApi<{ pitch: number | undefined }> = createStore(() => ({ pitch: undefined }));
  private stopSource?: () => void;

  constructor(private readonly source: PitchSource) {}

  get pitch(): number | undefined {
    return this.store.getState().pitch;
  }

  /** No reentra mientras ya hay lecturas activas. */
  start(): void {
    if (!this.source.available || this.stopSource) return;
    this.stopSource = this.source.start((p) => {
      const cur = this.pitch;
      this.store.setState({ pitch: cur === undefined ? p : cur + 0.3 * (p - cur) }); // suavizado exponencial
    });
  }

  stop(): void {
    this.stopSource?.();
    this.stopSource = undefined;
    this.store.setState({ pitch: undefined });
  }
}
