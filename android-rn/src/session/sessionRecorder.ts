// Session/SessionRecorder.swift — toma lecturas atadas al rumbo: una ráfaga de `PING` con la antena quieta ("Medir aquí").
import { createStore, type StoreApi } from 'zustand/vanilla';
import { bearing } from '../core/geo';
import { repeaterCoordinate, type Repeater } from '../core/repeater';
import { headingIsValid, makeReading, makeSample, type Reading, type Sample, type Session } from '../core/sessionModels';
import { parseSwiftInt } from '../core/swiftParse';
import { randomUuid } from '../core/uuid';
import { isLinkError } from '../link/lineTransport';
import { PingerLink, isPingerError } from '../link/pingerLink';
import { sleep } from '../link/async';
import type { LocationStore } from '../state/locationStore';
import type { SessionStore } from './sessionStore';

export type MeasureReason =
  | 'notReady' // sin enlace operativo con el pinger
  | 'noHash' // el repetidor no tiene prefijo hash
  | 'needsCalibration' // brújula sin calibrar o con precisión > 15°
  | 'noLocation'
  | 'measuring'; // ya hay una medición en curso

export class MeasureError extends Error {
  constructor(readonly reason: MeasureReason) {
    super(reason);
  }
}

export interface RecorderState {
  current: Session | undefined;
  measuring: boolean;
  done: number;
  total: number;
}

export class SessionRecorder {
  readonly store: StoreApi<RecorderState> = createStore<RecorderState>(() => ({ current: undefined, measuring: false, done: 0, total: 0 }));

  constructor(private readonly sessions?: SessionStore) {}

  get current(): Session | undefined {
    return this.store.getState().current;
  }
  get measuring(): boolean {
    return this.store.getState().measuring;
  }

  /** Empieza una sesión nueva para este repetidor (la siguiente medición la crea si no existe). */
  startSession(): void {
    this.store.setState({ current: undefined });
  }

  /**
   * Mide `count` pings consecutivos. Cada muestra guarda el rumbo al TX y al RX, la ubicación y el `P,`.
   * Pausa el modo "En vivo" mientras dura y lo retoma al terminar.
   */
  async measureHere(link: PingerLink, loc: LocationStore, repeater: Repeater, count = 5): Promise<Reading> {
    if (this.measuring) throw new MeasureError('measuring');
    if (!link.isOperational) throw new MeasureError('notReady');
    const hash = repeater.hashPrefix;
    if (hash === undefined) throw new MeasureError('noHash');
    if (!headingIsValid(loc.headingAccuracy) || loc.heading === undefined) throw new MeasureError('needsCalibration');
    const here = loc.location;
    if (!here) throw new MeasureError('noLocation');

    this.store.setState({ measuring: true, done: 0, total: count });
    const wasLive = link.live;
    link.stopLive();
    try {
      if (link.hash !== hash) await link.configure(hash);

      const session: Session = this.current ?? {
        id: randomUuid(), repeater, started: new Date(), proto: link.device?.proto ?? 1, readings: [], samples: [],
        ...optional('txpDbm', parseSwiftInt(link.config['txp'] ?? '')),
        ...optional('fw', link.device?.fw),
      };
      const index = session.readings.length + 1;
      const interval = Math.max(PingerLink.minLiveInterval, parseSwiftInt(link.config['rate'] ?? '') ?? 0);
      const target = bearing(loc.location ?? here, repeaterCoordinate(repeater));

      const samples: Sample[] = [];
      for (let i = 0; i < count; i++) {
        const started = Date.now();
        let tx: { heading: number; accuracy: number; location: NonNullable<typeof here> } | undefined;
        try {
          const report = await link.ping(() => {
            const h = loc.heading;
            const l = loc.location;
            if (h !== undefined && l) tx = { heading: h, accuracy: loc.headingAccuracy, location: l };
          });
          const hRx = loc.heading;
          if (tx && hRx !== undefined) {
            samples.push(makeSample({
              readingIndex: index, report, headingTx: tx.heading, headingRx: hRx, headingAccuracy: tx.accuracy,
              location: tx.location, targetBearing: target,
            }));
          }
        } catch (e) {
          // el pinger estaba ocupado o sin hash (rejected) o sin respuesta local (timeout): esa muestra no se toma
          const skipped = (isPingerError(e) && e.kind === 'rejected') || (isLinkError(e) && e.kind === 'timeout');
          if (!skipped) throw e;
        }
        this.store.setState({ done: i + 1 });
        if (i < count - 1) await sleep(started + interval - Date.now());
      }

      const reading = makeReading(index, samples);
      const updated: Session = { ...session, readings: [...session.readings, reading], samples: [...session.samples, ...samples] };
      this.store.setState({ current: updated });
      try {
        this.sessions?.save(updated);
      } catch {
        // `try? store?.save(session)`: un fallo al guardar no impide devolver la lectura
      }
      return reading;
    } finally {
      this.store.setState({ measuring: false });
      if (wasLive) link.startLive();
    }
  }
}

function optional<K extends string, V>(key: K, v: V | undefined): { [P in K]?: V } {
  return (v === undefined ? {} : { [key]: v }) as { [P in K]?: V };
}
