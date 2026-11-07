// Link/SimulatedPinger.swift — pinger simulado para demos y desarrollo sin hardware (spec 003, research R-6).
//
// Habla el mismo protocolo de líneas que el firmware y lo imita en lo que importa a la app:
// - cada `PING` tarda ≈ 1.4 s en dar su `P,` (ToA 177 ms + ventana de recepción de 1207 ms);
// - un `PING` con otro pendiente responde `!ERR state busy`; sin hash, `!ERR state nohash`;
// - respeta el límite de TX del 10 % en 60 s y avisa con `#WARN duty_wait <ms>` cuando retrasa un TX.
//
// El SNR de subida sigue un patrón de Yagi en función del ángulo entre el rumbo del teléfono y el azimut al repetidor.
import { formatFixed, formatHex } from '../core/formatC';
import { signedDelta } from '../core/geo';
import { normalizedHashPrefix } from '../core/repeater';
import { roundHalfAwayFromZero } from '../core/round';
import { WHITESPACES_AND_NEWLINES, trimmingCharacters } from '../core/foundation';
import { swiftSplit } from '../core/split';
import { SplitMix64 } from '../core/splitmix64';
import { bigintToNumber, parseSwiftInt } from '../core/swiftParse';
import { yagiGain } from '../core/yagiGain';
import { AsyncStream, TaskToken } from './async';
import { connecting, failed, idle, linkErrors, ready, type LineTransport, type LinkState } from './lineTransport';

export interface SimConfig {
  snr0: number; // dB de SNR de subida en el centro del haz
  n: number; // haz de −3 dB en ±33.5° (≈ Yagi de 3 elementos)
  frontToBackDB: number;
  noiseSigma: number; // dB
  lossProbability: number;
  delayScale: number; // 1 = tiempos reales; <1 acelera las demos
  seed: bigint;
}

export const defaultSimConfig: SimConfig = { snr0: 8.0, n: 8.0, frontToBackDB: 12.0, noiseSigma: 0.75, lossProbability: 0.05, delayScale: 1.0, seed: 1n };

/** Rumbo del teléfono y azimut al repetidor, compartidos con el pinger simulado. La interfaz los actualiza cuando cambian. */
export class SimInputs {
  heading: number | undefined;
  target: number | undefined;
}

export class SimulatedPinger implements LineTransport {
  readonly lines = new AsyncStream<string>();
  readonly states = new AsyncStream<LinkState>();
  private _state: LinkState = idle;
  private readonly engine: Engine;

  /** `heading` y `targetBearing` se leen en el instante de cada TX simulado. */
  constructor(
    config: Partial<SimConfig> = {},
    heading: () => number | undefined = () => undefined,
    targetBearing: () => number | undefined = () => undefined,
  ) {
    this.engine = new Engine({ ...defaultSimConfig, ...config }, heading, targetBearing, (l) => this.lines.push(l));
  }

  get state(): LinkState {
    return this._state;
  }

  private setState(s: LinkState): void {
    this._state = s;
    this.states.push(s);
  }

  async open(): Promise<void> {
    if (this._state.kind === 'ready') return;
    this.setState(connecting);
    await new Promise<void>((r) => setTimeout(r, 300));
    this.setState(ready);
  }

  close(): void {
    this.setState(idle);
    this.engine.cancel();
    this.lines.finish();
    this.states.finish();
  }

  async send(line: string): Promise<void> {
    if (this._state.kind !== 'ready') throw linkErrors.connectionLost;
    this.engine.handle(line);
  }

  /** Para probar la reconexión: el enlace se cae pero el pinger conserva su configuración. */
  simulateDisconnect(): void {
    this.setState(failed(linkErrors.connectionLost));
  }
}

const nowMs = (): number => Date.now();

class Engine {
  private rng: SplitMix64;
  private hash: string | undefined;
  private rateMs = 1500;
  private pending = false;
  private seq = 0;
  private txLog: { start: number; dur: number }[] = []; // ms, ya escalados
  private task = new TaskToken();

  constructor(
    private readonly config: SimConfig,
    private readonly heading: () => number | undefined,
    private readonly target: () => number | undefined,
    private readonly emit: (line: string) => void,
  ) {
    this.rng = new SplitMix64(config.seed);
  }

  cancel(): void {
    this.task.cancel();
  }

  handle(raw: string): void {
    const parts = swiftSplit(trimmingCharacters(raw, WHITESPACES_AND_NEWLINES), ' ', { maxSplits: 1 });
    const word = parts[0]?.toUpperCase();
    if (word === undefined) return;
    const arg = parts.length > 1 ? (parts[1] as string) : '';
    switch (word) {
      case 'HELLO': return this.emit('#HELLO fw=sim proto=1 radio=SX1262 id=51AA01');
      case 'CFG?': return this.emit(`#CFG freq=915.800 bw=250 sf=10 cr=5 txp=22 hash=${this.hash ?? ''} rate=${this.rateMs} timeout=auto raw=0`);
      case 'STOP': return this.emit('#OK stop');
      case 'MON': return this.emit(`#OK mon=${arg.toLowerCase()}`);
      case 'SET': return this.set(arg);
      case 'PING': return this.ping();
      default: return this.emit('!ERR unknown');
    }
  }

  private set(arg: string): void {
    const kv = swiftSplit(arg, '=', { maxSplits: 1 });
    if (kv.length !== 2) return this.emit('!ERR syntax');
    const key = kv[0] as string;
    const value = kv[1] as string;
    switch (key.toLowerCase()) {
      case 'hash': {
        const h = normalizedHashPrefix(value);
        if (h === undefined) return this.emit('!ERR range hash 00-FF');
        this.hash = h;
        return this.emit(`#OK hash=${value}`);
      }
      case 'rate': {
        const r = parseSwiftInt(value);
        if (r === undefined || r < 1000) return this.emit('!ERR range rate>=1000');
        this.rateMs = r;
        return this.emit(`#OK rate=${r}`);
      }
      case 'freq': case 'bw': case 'sf': case 'cr': case 'txp': case 'timeout': case 'raw':
        return this.emit(`#OK ${key}=${value}`);
      default:
        return this.emit(`!ERR unknown ${key}`);
    }
  }

  private ping(): void {
    if (this.hash === undefined) return this.emit('!ERR state nohash');
    if (this.pending) return this.emit('!ERR state busy');
    this.pending = true;
    void this.runPing().finally(() => {
      this.pending = false;
    });
  }

  private async runPing(): Promise<void> {
    const c = this.config;
    const toa = 177 * c.delayScale;
    const window = 60_000 * c.delayScale;
    const budget = 6_000 * c.delayScale;

    // Límite de TX: el 10 % de 60 s. Si no cabe, el TX se retrasa y se avisa.
    for (;;) {
      const now = nowMs();
      this.txLog = this.txLog.filter((e) => !(now - e.start >= window));
      const used = this.txLog.reduce((a, e) => a + e.dur, 0);
      if (used + toa <= budget) break;
      const wait = Math.max((this.txLog[0]?.start ?? now) + window - now, 1);
      this.emit(`#WARN duty_wait ${Math.trunc(wait / c.delayScale)}`);
      await this.task.sleep(wait);
      if (this.task.cancelled) return;
    }
    this.txLog.push({ start: nowMs(), dur: toa });

    const h = this.heading();
    const t = this.target();
    const delta = h === undefined || t === undefined ? 0 : signedDelta(t, h);
    await this.task.sleep(toa + 1207 * c.delayScale); // el pinger espera toda su ventana
    if (this.task.cancelled) return;

    this.seq += 1;
    const tag = formatHex(bigintToNumber(BigInt.asUintN(32, this.rng.next())));
    if (this.rng.uniform() < c.lossProbability) {
      this.emit(`P,${this.seq},${tag},timeout,,,,,0`);
      return;
    }
    const up = quantised(c.snr0 + yagiGain(delta, c.n, c.frontToBackDB) + this.rng.gaussian() * c.noiseSigma);
    const dn = quantised(up - 1.0 + this.rng.gaussian() * c.noiseSigma);
    const rssi = roundHalfAwayFromZero(-108 + dn) + (this.rng.uniform() < 0.5 ? 0 : 0.5);
    const rtt = Math.trunc(220 + this.rng.uniform() * 230);
    this.emit(`P,${this.seq},${tag},ok,${rtt},${formatFixed(up, 2, true)},${formatFixed(dn, 2, true)},${formatFixed(rssi, 1, true)},1`);
  }
}

const quantised = (x: number): number => Math.trunc(x * 4) / 4;
