// Haptics.swift — vibración sostenida al alinear la antena: continua (0.8) + golpes (1.0) cada 0.5 s durante `duration`
// segundos o hasta `stop()`. PM-10: en Android, una forma de onda de 6 ciclos de [40 ms a 255, 460 ms a 204] = 3 s.
import type { HapticsDriver } from '../native/haptics';

export class Haptics {
  private token = 0;
  private active = false;

  constructor(private readonly driver: HapticsDriver) {}

  get isActive(): boolean {
    return this.active;
  }

  startAligned(duration = 3): void {
    if (this.active) return; // varias brújulas pueden disparar a la vez
    try {
      if (!this.driver.hasAmplitudeControl()) {
        this.driver.notify('success');
        return;
      }
      const cycles = Math.ceil(duration / 0.5);
      const timings: number[] = [];
      const amplitudes: number[] = [];
      for (let i = 0; i < cycles; i++) {
        timings.push(40, 460);
        amplitudes.push(255, 204);
      }
      this.driver.vibrateWaveform(timings, amplitudes);
      this.active = true;
      this.token += 1;
      const mine = this.token;
      setTimeout(() => {
        if (this.token === mine) this.active = false;
      }, duration * 1000);
    } catch {
      this.driver.notify('success');
    }
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.token += 1;
    this.driver.cancel();
  }

  /** Respuesta háptica al terminar una medición (FR-043). */
  notify(kind: 'success' | 'warning'): void {
    this.driver.notify(kind);
  }
}
