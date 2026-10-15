// Protocolo de líneas `proto=1` del pinger (specs/001.../contracts/line-protocol.md), traspaso de LineCodec.swift L1–158.
import { trimmingCharacters } from './foundation';
import { bigintToNumber, parseSwiftDouble, parseSwiftInt, parseSwiftUInt } from './swiftParse';
import { swiftSplit } from './split';

export type PingStatus = 'ok' | 'timeout' | 'busy' | 'txerr';

export interface PingResult {
  seq: number; // UInt32
  tag: string; // 8 hex en mayúsculas, en el orden de impresión del firmware
  status: PingStatus;
  rttMs?: number; // solo con status == ok
  snrUp?: number; // dB; SNR con que el repetidor oyó al pinger (viene en el eco)
  snrDn?: number; // dB; SNR con que el pinger oyó al repetidor
  rssiDn?: number; // dBm
  nResp: number; // ecos aceptados con ese tag (>1 = posible colisión de hash)
}

/** Línea `S,`: resumen de una ráfaga `PING n` (la app usa `PING` sueltos y calcula el suyo). */
export interface BurstSummary {
  n: number;
  ok: number;
  lossPct?: number;
  medSnrUp?: number;
  medSnrDn?: number;
  medRssiDn?: number;
  busy: number; // busy + txerr; no cuentan como pérdida
}

/** Línea `R,`: trama cruda. El firmware trunca a 64 bytes y marca con `..`. */
export interface RawFrame {
  tMs: number;
  rssi: number;
  snr: number;
  hex: string; // sin el sufijo ".."
  truncated: boolean;
}

export type PingerEvent =
  | { kind: 'hello'; fw: string; proto: number; radio: string; id: string }
  | { kind: 'cfg'; values: Record<string, string> }
  | { kind: 'ok'; text: string }
  | { kind: 'warn'; code: string; detail?: string }
  | { kind: 'error'; code: string; detail?: string }
  | { kind: 'ping'; result: PingResult }
  | { kind: 'summary'; summary: BurstSummary }
  | { kind: 'raw'; frame: RawFrame }
  | { kind: 'unknown'; line: string };

/** Resultado de un `PING` con los instantes que necesita el registro de sesión (PingerLink.swift L5–10). */
export interface PingReport {
  result: PingResult;
  tTx: Date; // justo después de escribir el comando (fija `heading_tx`)
  tRx: Date; // al recibir el `P,` (fija `heading_rx`)
  dutyWait: boolean; // llegó `#WARN duty_wait` entre el `PING` y su `P,`: el TX se retrasó
}

const UINT32_MAX = 0xffff_ffffn;
const UINT8_MAX = 0xffn;
const STATUSES: readonly string[] = ['ok', 'timeout', 'busy', 'txerr'];

// ponytail: Swift compara prefijos por grafema (un "," seguido de una marca combinante no coincide); aquí es por unidad
// de código. El firmware solo emite ASCII, así que no cambia nada observable.
const has = (line: string, prefix: string) => line.startsWith(prefix);

/** Interpreta una línea completa (sin `\n`). Nunca falla: lo que no entiende es `unknown`. */
export function parse(raw: string): PingerEvent {
  const line = trimmingCharacters(raw, '\r\n');
  let event: PingerEvent | undefined;
  if (has(line, 'P,')) event = ping(line.slice(2));
  else if (has(line, 'S,')) event = summary(line.slice(2));
  else if (has(line, 'R,')) event = rawFrame(line.slice(2));
  else if (has(line, '#HELLO ')) event = hello(line.slice(7));
  else if (has(line, '#CFG ')) event = cfg(line.slice(5));
  else if (has(line, '#OK ')) event = { kind: 'ok', text: line.slice(4) };
  else if (has(line, '#WARN ')) event = withCode(line.slice(6), 'warn');
  else if (has(line, '!ERR ')) event = withCode(line.slice(5), 'error');
  return event ?? { kind: 'unknown', line };
}

function ping(body: string): PingerEvent | undefined {
  // seq,tag,status,rtt,snr_up,snr_dn,rssi,n_resp  (se toleran campos añadidos al final)
  const f = body.split(',');
  if (f.length < 8) return undefined;
  const seq = uint(f[0]);
  if (seq === undefined || seq > UINT32_MAX) return undefined;
  const tag = f[1] as string;
  if (!isHex(tag) || tag.length !== 8) return undefined;
  const status = f[2] as string;
  if (!STATUSES.includes(status)) return undefined;
  const nResp = uint(f[7]);
  if (nResp === undefined || nResp > UINT8_MAX) return undefined;

  const result: PingResult = { seq: bigintToNumber(seq), tag: tag.toUpperCase(), status: status as PingStatus, nResp: bigintToNumber(nResp) };
  if (status === 'ok') {
    const r = uint(f[3]);
    const u = number(f[4]);
    const d = number(f[5]);
    const s = number(f[6]);
    if (r === undefined || r > UINT32_MAX || u === undefined || d === undefined || s === undefined) return undefined;
    result.rttMs = bigintToNumber(r);
    result.snrUp = u;
    result.snrDn = d;
    result.rssiDn = s;
  }
  return { kind: 'ping', result };
}

function summary(body: string): PingerEvent | undefined {
  // n,ok,loss,med_up,med_dn,med_rssi[,busy]  (busy ausente = 0, firmware anterior)
  const f = body.split(',');
  if (f.length < 6) return undefined;
  const n = uint(f[0]);
  const ok = uint(f[1]);
  if (n === undefined || ok === undefined) return undefined;
  const s: BurstSummary = { n: bigintToNumber(n), ok: bigintToNumber(ok), busy: 0 };
  if (f[2] !== '') {
    const l = uint(f[2]);
    if (l === undefined) return undefined;
    s.lossPct = bigintToNumber(l);
  }
  const optionalNumber = (text: string | undefined): number | null | undefined => {
    if (text === '') return undefined;
    const v = number(text);
    return v === undefined ? null : v;
  };
  const up = optionalNumber(f[3]);
  const dn = optionalNumber(f[4]);
  const rssi = optionalNumber(f[5]);
  if (up === null || dn === null || rssi === null) return undefined;
  if (up !== undefined) s.medSnrUp = up;
  if (dn !== undefined) s.medSnrDn = dn;
  if (rssi !== undefined) s.medRssiDn = rssi;
  if (f.length >= 7) {
    const b = uint(f[6]);
    if (b === undefined) return undefined;
    s.busy = bigintToNumber(b);
  }
  return { kind: 'summary', summary: s };
}

function rawFrame(body: string): PingerEvent | undefined {
  // t_ms,rssi,snr,hex  (el hex va al final y puede terminar en "..")
  const f = swiftSplit(body, ',', { maxSplits: 3, omitEmpty: false });
  if (f.length !== 4) return undefined;
  const t = uint(f[0]);
  const rssi = number(f[1]);
  const snr = number(f[2]);
  if (t === undefined || t > UINT32_MAX || rssi === undefined || snr === undefined) return undefined;
  let hex = f[3] as string;
  const truncated = hex.endsWith('..');
  if (truncated) hex = hex.slice(0, -2);
  if (hex.length % 2 !== 0 || !/^[0-9A-Fa-f]*$/.test(hex)) return undefined;
  return { kind: 'raw', frame: { tMs: bigintToNumber(t), rssi, snr, hex: hex.toUpperCase(), truncated } };
}

function hello(body: string): PingerEvent | undefined {
  const kv = keyValues(body);
  const protoText = kv['proto'];
  const proto = protoText === undefined ? undefined : parseSwiftInt(protoText);
  const { fw, radio, id } = kv;
  if (fw === undefined || proto === undefined || radio === undefined || id === undefined) return undefined;
  return { kind: 'hello', fw, proto, radio, id };
}

function cfg(body: string): PingerEvent | undefined {
  const values = keyValues(body);
  return Object.keys(values).length === 0 ? undefined : { kind: 'cfg', values };
}

// MARK: - Ayudas

/** "k=v k2=v2 clave=" → diccionario (el valor puede ir vacío, como `hash=`). */
function keyValues(s: string): Record<string, string> {
  const out = new Map<string, string>();
  for (const token of swiftSplit(s, ' ')) {
    const eq = token.indexOf('=');
    if (eq < 0) continue;
    out.set(token.slice(0, eq), token.slice(eq + 1));
  }
  return Object.fromEntries(out);
}

/** "range rate>=1000" → { code: "range", detail: "rate>=1000" }; el detalle es el resto de la línea. */
function codeAndDetail(s: string): { code: string; detail?: string } | undefined {
  const parts = swiftSplit(s, ' ', { maxSplits: 1, omitEmpty: true });
  const code = parts[0];
  if (code === undefined) return undefined;
  return parts.length > 1 ? { code, detail: parts[1] as string } : { code };
}

function withCode(s: string, kind: 'warn' | 'error'): PingerEvent | undefined {
  const cd = codeAndDetail(s);
  return cd && { kind, ...cd };
}

/** Entero sin signo estricto: solo dígitos ASCII (rechaza "+5", " 5", "-1", ""). */
const uint = (s: string | undefined): bigint | undefined => (s === undefined ? undefined : parseSwiftUInt(s));

/** Decimal con signo opcional ("+3.25", "-6.00"); rechaza vacío, "nan" e "inf". */
function number(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const v = parseSwiftDouble(s);
  return v !== undefined && Number.isFinite(v) ? v : undefined;
}

const isHex = (s: string): boolean => s !== '' && /^[0-9A-Fa-f]+$/.test(s);
