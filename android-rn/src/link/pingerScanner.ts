// PingerPicker.swift (PingerScanner) — escanea pingers BLE cercanos (`YagiPinger-*`) para el selector.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { TaskToken } from './async';
import type { BleLineTransport } from './bleLineTransport';
import { idle, type LinkState, type PingerDevice } from './lineTransport';

export interface ScannerState {
  devices: PingerDevice[];
  state: LinkState;
  timedOut: boolean;
}

export class PingerScanner {
  /** Sin resultados a los 10 s aparece "No se encontró ningún pinger…" (nunca un spinner infinito). */
  static readonly timeoutMs = 10_000;

  readonly store: StoreApi<ScannerState> = createStore<ScannerState>(() => ({ devices: [], state: idle, timedOut: false }));
  private transport: BleLineTransport | undefined;
  private tokens: TaskToken[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `makeTransport` crea un `BleLineTransport` sin dispositivo objetivo (`deviceID: nil`). */
  constructor(private readonly makeTransport: () => BleLineTransport) {}

  start(): void {
    this.stop();
    const t = this.makeTransport();
    this.transport = t;
    this.store.setState({ timedOut: false });
    const devices = new TaskToken();
    const states = new TaskToken();
    this.tokens = [devices, states];
    void (async () => {
      for await (const d of t.devices) {
        if (devices.cancelled) break;
        this.store.setState({ devices: d });
      }
    })();
    void (async () => {
      for await (const s of t.states) {
        if (states.cancelled) break;
        this.store.setState({ state: s });
      }
    })();
    this.timer = setTimeout(() => this.store.setState({ timedOut: true }), PingerScanner.timeoutMs);
    t.startScan();
  }

  stop(): void {
    for (const t of this.tokens) t.cancel();
    this.tokens = [];
    clearTimeout(this.timer);
    this.transport?.close();
    this.transport = undefined;
  }
}
