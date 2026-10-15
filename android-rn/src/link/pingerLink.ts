// Link/PingerLink.swift — enlace con el pinger: handshake, configuración, `PING` individuales, modo "En vivo" y reconexión.
//
// La app NUNCA usa `GO`: envía un `PING` por muestra, espera su `P,` y solo entonces el siguiente. Así conoce el instante
// de cada TX (para `heading_tx`) y respeta el límite de TX del pinger (intervalo en vivo por defecto 2000 ms; research R-10).
import { createStore, type StoreApi } from 'zustand/vanilla';
import { parse, type PingReport, type PingResult, type PingerEvent } from '../core/lineCodec';
import { normalizedHashPrefix } from '../core/repeater';
import { parseSwiftInt } from '../core/swiftParse';
import { TaskToken } from './async';
import { SimInputs } from './simulatedPinger';
import {
  failed, idle, isLinkError, linkErrors, stateIsReady,
  type LineTransport, type LinkError, type LinkState, type PingerDevice,
} from './lineTransport';

export type { PingReport };

/** El pinger rechazó el comando (`!ERR <code> [detalle]`) o ya hay otra petición en curso. */
export type PingerError = { kind: 'rejected'; code: string; detail?: string } | { kind: 'requestInFlight' };

export const isPingerError = (e: unknown): e is PingerError =>
  typeof e === 'object' && e !== null && 'kind' in e && ((e as { kind: string }).kind === 'rejected' || (e as { kind: string }).kind === 'requestInFlight');

/** Buffer circular de capacidad fija (los últimos N elementos). */
export class RingBuffer<T> {
  private items: T[] = [];
  constructor(readonly capacity: number) {}
  get elements(): readonly T[] {
    return this.items;
  }
  append(e: T): void {
    this.items = [...this.items, e];
    if (this.items.length > this.capacity) this.items = this.items.slice(this.items.length - this.capacity);
  }
  removeAll(): void {
    this.items = [];
  }
}

export interface PingerLinkState {
  state: LinkState;
  device: PingerDevice | undefined;
  config: Record<string, string>; // último #CFG
  last: PingResult | undefined;
  history: readonly PingResult[]; // últimos 30
  live: boolean;
  lastWarning: string | undefined;
  hash: string | undefined;
  handshakeDone: boolean;
}

/** `state.isReady && handshakeDone`. */
export const isOperational = (s: Pick<PingerLinkState, 'state' | 'handshakeDone'>): boolean => stateIsReady(s.state) && s.handshakeDone;

/** Una sola resolución: el primer evento, error o timeout que llegue. */
class Waiter {
  dutyWait = false;
  tTx = new Date();
  timeout: ReturnType<typeof setTimeout> | undefined;
  private settle!: { ok: (e: PingerEvent) => void; err: (e: unknown) => void };
  private finished = false;
  private readonly promise: Promise<PingerEvent>;

  constructor(readonly accept: (e: PingerEvent) => boolean) {
    this.promise = new Promise((ok, err) => {
      this.settle = { ok, err };
    });
    this.promise.catch(() => undefined); // un fallo sin nadie esperando no debe ser "unhandled"
  }

  await(): Promise<PingerEvent> {
    return this.promise;
  }

  finish(result: { ok: PingerEvent } | { err: unknown }): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timeout);
    if ('ok' in result) this.settle.ok(result.ok);
    else this.settle.err(result.err);
  }
}

export class PingerLink {
  /** Intervalo mínimo entre inicios de `PING` en "En vivo". */
  static readonly minLiveInterval = 2000;
  /** Sin respuesta del pinger tras este tiempo, `ping()` falla (el pinger tarda ≈ 1.4 s con el preset por defecto). */
  static readonly requestTimeout = 6000;

  readonly store: StoreApi<PingerLinkState> = createStore<PingerLinkState>(() => ({
    state: idle, device: undefined, config: {}, last: undefined, history: [], live: false, lastWarning: undefined, hash: undefined, handshakeDone: false,
  }));

  private ring = new RingBuffer<PingResult>(30);
  private transport: LineTransport | undefined;
  private readerTask: TaskToken | undefined;
  private statesTask: TaskToken | undefined;
  private liveTask: TaskToken | undefined;
  private reconnectTask: TaskToken | undefined;
  private waiter: Waiter | undefined;
  private wantConnected = false;
  private resumeLiveAfterReconnect = false;

  /** Rumbo y azimut que lee el pinger simulado (la interfaz los actualiza). */
  readonly simInputs: SimInputs;

  /** `makeTransport` recibe el dispositivo elegido (undefined = el último usado / el primero que aparezca). */
  constructor(private readonly makeTransport: (device: PingerDevice | undefined) => LineTransport, simInputs: SimInputs = new SimInputs()) {
    this.simInputs = simInputs;
  }

  private get s(): PingerLinkState {
    return this.store.getState();
  }
  private set(p: Partial<PingerLinkState>): void {
    this.store.setState(p);
  }

  get state(): LinkState { return this.s.state; }
  get device(): PingerDevice | undefined { return this.s.device; }
  get config(): Record<string, string> { return this.s.config; }
  get last(): PingResult | undefined { return this.s.last; }
  get history(): readonly PingResult[] { return this.s.history; }
  get live(): boolean { return this.s.live; }
  get lastWarning(): string | undefined { return this.s.lastWarning; }
  get hash(): string | undefined { return this.s.hash; }
  get isOperational(): boolean { return isOperational(this.s); }

  // MARK: - Conexión

  /** Abre el enlace, valida el firmware y deja al pinger listo (`STOP`, `MON off`, `CFG?`, `SET hash`). */
  async connect(device?: PingerDevice, hash?: string): Promise<void> {
    this.disconnect();
    this.wantConnected = true;
    this.set({ device, hash });
    const t = this.makeTransport(device);
    this.transport = t;
    this.startReaders(t);
    try {
      await t.open();
      await this.handshake();
    } catch (e) {
      this.fail(e);
    }
  }

  disconnect(): void {
    this.wantConnected = false;
    this.stopLive();
    this.reconnectTask?.cancel(); this.reconnectTask = undefined;
    this.readerTask?.cancel(); this.readerTask = undefined;
    this.statesTask?.cancel(); this.statesTask = undefined;
    this.waiter?.finish({ err: linkErrors.connectionLost }); this.waiter = undefined;
    this.transport?.close(); this.transport = undefined;
    this.set({ handshakeDone: false, state: idle });
  }

  /** Cambia el repetidor objetivo (válido en cualquier momento; el pinger lo aplica al siguiente ping). */
  async configure(hash: string): Promise<void> {
    const h = normalizedHashPrefix(hash);
    if (h === undefined) throw { kind: 'rejected', code: 'range', detail: 'hash 00-FF' } satisfies PingerError;
    await this.request(`SET hash=${h}`, undefined, (e) => e.kind === 'ok' && e.text.toLowerCase().startsWith('hash='));
    this.set({ hash: h });
  }

  private async handshake(): Promise<void> {
    const hello = await this.request('HELLO', undefined, (e) => e.kind === 'hello');
    if (hello.event.kind === 'hello') {
      const { fw, proto } = hello.event;
      const d = this.s.device;
      if (d) this.set({ device: { ...d, fw, proto } });
      if (proto !== 1) throw { kind: 'incompatibleFirmware', proto } satisfies LinkError;
    }
    await this.request('STOP', undefined, (e) => e.kind === 'ok' && e.text === 'stop');
    await this.request('MON off', undefined, (e) => e.kind === 'ok' && e.text === 'mon=off');
    await this.request('CFG?', undefined, (e) => e.kind === 'cfg');
    const hash = this.s.hash;
    if (hash !== undefined) await this.configure(hash);
    this.set({ handshakeDone: true, state: { kind: 'ready' } });
  }

  private fail(error: unknown): void {
    const e: LinkError = isLinkError(error) ? error : linkErrors.connectionLost;
    this.set({ handshakeDone: false, state: failed(e) });
    this.transport?.close(); this.transport = undefined;
    this.readerTask?.cancel(); this.statesTask?.cancel();
    this.wantConnected = false;
  }

  // MARK: - Ping

  /**
   * Envía un `PING` y espera su `P,`. Falla con `PingerError.rejected` si el pinger responde `!ERR` (p. ej. `state busy`)
   * o con `LinkError.timeout` si no responde. `onSent` se llama justo después de escribir el comando: ahí hay que leer el
   * rumbo (`heading_tx`).
   */
  async ping(onSent?: () => void): Promise<PingReport> {
    if (!this.isOperational) throw linkErrors.connectionLost;
    const r = await this.request('PING', onSent, (e) => e.kind === 'ping');
    if (r.event.kind !== 'ping') throw linkErrors.writeFailed;
    return { result: r.event.result, tTx: r.tTx, tRx: new Date(), dutyWait: r.dutyWait };
  }

  startLive(): void {
    if (!this.isOperational || this.s.live) return;
    this.set({ live: true });
    const token = new TaskToken();
    this.liveTask = token;
    void Promise.resolve().then(() => this.runLive(token));
  }

  stopLive(): void {
    this.set({ live: false });
    this.liveTask?.cancel(); this.liveTask = undefined;
  }

  private async runLive(token: TaskToken): Promise<void> {
    while (this.s.live && !token.cancelled) {
      const started = Date.now();
      try {
        await this.ping();
      } catch (e) {
        if (!isPingerError(e)) {
          this.set({ live: false }); // enlace caído o sin respuesta: la reconexión decide si se retoma
          return;
        }
        // busy / duty (rejected) o petición en curso: simplemente se espera al siguiente intervalo
      }
      const interval = Math.max(PingerLink.minLiveInterval, parseSwiftInt(this.s.config['rate'] ?? '') ?? 0);
      await token.sleep(started + interval - Date.now());
    }
  }

  // MARK: - Peticiones y lectura de líneas

  private async request(
    command: string,
    onSent: (() => void) | undefined,
    accept: (e: PingerEvent) => boolean,
  ): Promise<{ event: PingerEvent; tTx: Date; dutyWait: boolean }> {
    if (this.waiter) throw { kind: 'requestInFlight' } satisfies PingerError;
    const transport = this.transport;
    if (!transport) throw linkErrors.connectionLost;
    const w = new Waiter(accept);
    this.waiter = w;
    try {
      w.timeout = setTimeout(() => w.finish({ err: linkErrors.timeout }), PingerLink.requestTimeout);
      await transport.send(command);
      w.tTx = new Date();
      onSent?.();
      const event = await w.await();
      return { event, tTx: w.tTx, dutyWait: w.dutyWait };
    } finally {
      if (this.waiter === w) this.waiter = undefined;
      clearTimeout(w.timeout);
    }
  }

  private startReaders(t: LineTransport): void {
    this.readerTask?.cancel(); this.statesTask?.cancel();
    const reader = new TaskToken();
    const states = new TaskToken();
    this.readerTask = reader;
    this.statesTask = states;
    void (async () => {
      for await (const line of t.lines) {
        if (reader.cancelled) break;
        this.handle(parse(line));
      }
    })();
    void (async () => {
      for await (const s of t.states) {
        if (states.cancelled) break;
        this.transportStateChanged(s);
      }
    })();
  }

  private handle(event: PingerEvent): void {
    switch (event.kind) {
      case 'cfg':
        this.set({ config: event.values });
        break;
      case 'warn':
        this.set({ lastWarning: event.detail !== undefined ? `${event.code} ${event.detail}` : event.code });
        if (event.code === 'duty_wait' && this.waiter) this.waiter.dutyWait = true;
        break;
      case 'ping':
        this.ring.append(event.result);
        this.set({ last: event.result, history: this.ring.elements });
        break;
      default:
        break;
    }
    const w = this.waiter;
    if (!w) return;
    if (event.kind === 'error') {
      w.finish({ err: { kind: 'rejected', code: event.code, ...(event.detail !== undefined && { detail: event.detail }) } satisfies PingerError });
    } else if (w.accept(event)) {
      w.finish({ ok: event });
    }
  }

  // MARK: - Reconexión

  private transportStateChanged(s: LinkState): void {
    switch (s.kind) {
      case 'ready':
        if (this.s.handshakeDone) this.set({ state: s });
        break;
      case 'failed':
        if (s.error.kind === 'connectionLost') {
          this.resumeLiveAfterReconnect = this.s.live;
          this.set({ handshakeDone: false });
          this.stopLive();
          this.waiter?.finish({ err: linkErrors.connectionLost });
          this.set({ state: failed(linkErrors.connectionLost) });
          if (this.wantConnected) this.reconnect();
        }
        break;
      case 'idle':
        break;
      case 'scanning':
      case 'connecting':
        if (!this.s.handshakeDone) this.set({ state: s });
        break;
    }
  }

  /** Reintenta en segundo plano con espera 1-2-4 s (tope 4 s) mientras alguien quiera el enlace. */
  private reconnect(): void {
    const t = this.transport;
    if (this.reconnectTask || !t) return;
    const token = new TaskToken();
    this.reconnectTask = token;
    void (async () => {
      let delay = 1000;
      while (this.wantConnected && !token.cancelled) {
        await token.sleep(delay);
        if (!this.wantConnected || token.cancelled) break;
        try {
          await t.open();
          await this.handshake();
          this.reconnectTask = undefined;
          if (this.resumeLiveAfterReconnect) this.startLive();
          return;
        } catch (e) {
          if (isLinkError(e) && e.kind === 'incompatibleFirmware') {
            this.fail(e);
            return;
          }
          delay = Math.min(delay * 2, 4000);
        }
      }
      this.reconnectTask = undefined;
    })();
  }
}
