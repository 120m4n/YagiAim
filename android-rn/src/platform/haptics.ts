// Haptics.swift — vibración sostenida al alinear la antena: continua (0.8) + golpes (1.0) cada 0.5 s.
// PM-10: en Android, una forma de onda de 6 ciclos de [40 ms a 255, 460 ms a 204] = 3 s. A diferencia de iOS, que vibra
// `duration` segundos una sola vez, aquí la ráfaga se repite (con una pausa) mientras siga alineado, hasta `stop()`.
import type { HapticsDriver } from '../native/haptics';

export class Haptics {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;

  constructor(private readonly driver: HapticsDriver) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Ráfaga de `duration` s cada `duration + pause` s hasta `stop()`. */
  startAligned(duration = 3, pause = 1.5): void {
    if (this.active) return; // varias brújulas pueden disparar a la vez
    this.active = true;
    const burst = () => {
      try {
        if (this.driver.hasAmplitudeControl()) {
          const cycles = Math.ceil(duration / 0.5);
          const timings: number[] = [];
          const amplitudes: number[] = [];
          for (let i = 0; i < cycles; i++) {
            timings.push(40, 460);
            amplitudes.push(255, 204);
          }
          this.driver.vibrateWaveform(timings, amplitudes);
        } else {
          this.driver.notify('success');
        }
      } catch {
        this.driver.notify('success');
      }
      this.timer = setTimeout(burst, (duration + pause) * 1000);
    };
    burst();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    this.driver.cancel();
  }

  /** Respuesta háptica al terminar una medición (FR-043). */
  notify(kind: 'success' | 'warning'): void {
    this.driver.notify(kind);
  }
}
