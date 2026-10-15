// SF-03 y SF-04: JSON idéntico al de `JSONEncoder`/`JSONDecoder` de Swift (formato medido en los dorados).
//
// Codificación: claves ordenadas (`.sortedKeys`), opcionales ausentes omitidos, `/` escapado como `\/`, números con la
// descripción de Swift sin el ".0" final (1012.0 → 1012, -0.0 → -0, 1e-5 → 1e-05, 1e16 → 1e+16), `Date` como segundos
// desde 2001. `prettyPrinted`: sangría de 2 espacios, `"clave" : valor`, lista vacía "[\n\n]".
// Decodificación: los tipos deben coincidir (un solo objeto inválido invalida todo, como `decode([Repeater].self)`); las
// claves desconocidas se ignoran; el parser de Swift acepta una coma final antes de `]`/`}`.
import type { Reading, Sample, Session } from './sessionModels';
import type { PingResult } from './lineCodec';
import type { Repeater } from './repeater';
import { swiftDoubleDescription } from './swiftDescribe';
import { fromSwiftDate, toSwiftDate } from './swiftDate';
import { parseUuid } from './uuid';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json | undefined };

// MARK: - Codificación

function jsonString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '/') out += '\\/';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return out + '"';
}

export function jsonNumber(x: number): string {
  // JSONEncoder de Swift lanza con NaN o infinito (los llamadores usan `try?`).
  if (!Number.isFinite(x)) throw new Error('Número no codificable en JSON');
  const d = swiftDoubleDescription(x);
  return d.endsWith('.0') ? d.slice(0, -2) : d;
}

export function encodeJson(v: Json | undefined, pretty = false, indent = ''): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return jsonNumber(v);
  if (typeof v === 'string') return jsonString(v);
  const inner = indent + '  ';
  if (Array.isArray(v)) {
    if (!pretty) return `[${v.map((x) => encodeJson(x, false)).join(',')}]`;
    if (v.length === 0) return `[\n\n${indent}]`;
    return `[\n${v.map((x) => inner + encodeJson(x, true, inner)).join(',\n')}\n${indent}]`;
  }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  if (!pretty) return `{${keys.map((k) => `${jsonString(k)}:${encodeJson(v[k], false)}`).join(',')}}`;
  if (keys.length === 0) return `{\n\n${indent}}`;
  return `{\n${keys.map((k) => `${inner}${jsonString(k)} : ${encodeJson(v[k], true, inner)}`).join(',\n')}\n${indent}}`;
}

const repeaterJson = (r: Repeater): Json => ({
  id: r.id, name: r.name, latitude: r.latitude, longitude: r.longitude, altitude: r.altitude, hashPrefix: r.hashPrefix,
});

const pingResultJson = (r: PingResult): Json => ({
  seq: r.seq, tag: r.tag, status: r.status, rttMs: r.rttMs, snrUp: r.snrUp, snrDn: r.snrDn, rssiDn: r.rssiDn, nResp: r.nResp,
});

const sampleJson = (s: Sample): Json => ({
  id: s.id, readingIndex: s.readingIndex, tTx: toSwiftDate(s.tTx), tRx: toSwiftDate(s.tRx),
  headingTx: s.headingTx, headingRx: s.headingRx, headingAccuracy: s.headingAccuracy,
  latitude: s.latitude, longitude: s.longitude, altitude: s.altitude, hAccuracy: s.hAccuracy,
  targetBearing: s.targetBearing, delta: s.delta, unstable: s.unstable, invalid: s.invalid, result: pingResultJson(s.result),
});

const readingJson = (r: Reading): Json => ({
  id: r.id, index: r.index, meanHeading: r.meanHeading, meanDelta: r.meanDelta, medSnrUp: r.medSnrUp, medSnrDn: r.medSnrDn,
  medRssiDn: r.medRssiDn, lossPct: r.lossPct, stableCount: r.stableCount, needsRepeat: r.needsRepeat,
});

/** Exportación de repetidores: `prettyPrinted` + `sortedKeys` (SF-03). */
export const encodeRepeatersPretty = (list: readonly Repeater[]): string => encodeJson(list.map(repeaterJson), true);

/** Persistencia (`repeaters.v1`): compacto con claves ordenadas; Swift solo exige leerlo, no el orden. */
export const encodeRepeaters = (list: readonly Repeater[]): string => encodeJson(list.map(repeaterJson));

/** Sesión: `.sortedKeys` sin `prettyPrinted` (SF-04). */
export const encodeSession = (s: Session): string =>
  encodeJson({
    id: s.id, repeater: repeaterJson(s.repeater), started: toSwiftDate(s.started), txpDbm: s.txpDbm, fw: s.fw, proto: s.proto,
    readings: s.readings.map(readingJson), samples: s.samples.map(sampleJson),
  });

// MARK: - Decodificación

/** JSON.parse tolerando comas finales fuera de cadenas (el parser de Swift las acepta). */
function parseLenient(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      out += c;
      if (c === '\\') out += text.charAt(++i);
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === ',') {
      let j = i + 1;
      while (j < text.length && ' \t\r\n'.includes(text.charAt(j))) j++;
      if (text.charAt(j) !== ']' && text.charAt(j) !== '}') out += c;
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}

class DecodeError extends Error {}
const bad = (): never => {
  throw new DecodeError();
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : bad());
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : bad());
const str = (v: unknown): string => (typeof v === 'string' ? v : bad());
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad());
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : bad());
const int = (v: unknown, min = -(2 ** 53), max = 2 ** 53): number => {
  const n = num(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : bad();
};
const opt = <T>(v: unknown, f: (x: unknown) => T): T | undefined => (v === undefined || v === null ? undefined : f(v));
const uuid = (v: unknown): string => parseUuid(str(v)) ?? bad();

function repeaterFrom(v: unknown): Repeater {
  const o = obj(v);
  const r: Repeater = { id: uuid(o['id']), name: str(o['name']), latitude: num(o['latitude']), longitude: num(o['longitude']) };
  const alt = opt(o['altitude'], num);
  const hash = opt(o['hashPrefix'], str);
  if (alt !== undefined) r.altitude = alt;
  if (hash !== undefined) r.hashPrefix = hash;
  return r;
}

function pingResultFrom(v: unknown): PingResult {
  const o = obj(v);
  const status = str(o['status']);
  if (status !== 'ok' && status !== 'timeout' && status !== 'busy' && status !== 'txerr') bad();
  const r: PingResult = { seq: int(o['seq'], 0, 0xffff_ffff), tag: str(o['tag']), status: status as PingResult['status'], nResp: int(o['nResp'], 0, 255) };
  const rtt = opt(o['rttMs'], (x) => int(x, 0, 0xffff_ffff));
  const up = opt(o['snrUp'], num);
  const dn = opt(o['snrDn'], num);
  const rssi = opt(o['rssiDn'], num);
  if (rtt !== undefined) r.rttMs = rtt;
  if (up !== undefined) r.snrUp = up;
  if (dn !== undefined) r.snrDn = dn;
  if (rssi !== undefined) r.rssiDn = rssi;
  return r;
}

function sampleFrom(v: unknown): Sample {
  const o = obj(v);
  const s: Sample = {
    id: uuid(o['id']), readingIndex: int(o['readingIndex']), tTx: fromSwiftDate(num(o['tTx'])), tRx: fromSwiftDate(num(o['tRx'])),
    headingTx: num(o['headingTx']), headingRx: num(o['headingRx']), headingAccuracy: num(o['headingAccuracy']),
    latitude: num(o['latitude']), longitude: num(o['longitude']), hAccuracy: num(o['hAccuracy']),
    targetBearing: num(o['targetBearing']), delta: num(o['delta']), unstable: bool(o['unstable']), invalid: bool(o['invalid']),
    result: pingResultFrom(o['result']),
  };
  const alt = opt(o['altitude'], num);
  if (alt !== undefined) s.altitude = alt;
  return s;
}

function readingFrom(v: unknown): Reading {
  const o = obj(v);
  const r: Reading = { id: uuid(o['id']), index: int(o['index']), stableCount: int(o['stableCount']), needsRepeat: bool(o['needsRepeat']) };
  for (const k of ['meanHeading', 'meanDelta', 'medSnrUp', 'medSnrDn', 'medRssiDn'] as const) {
    const x = opt(o[k], num);
    if (x !== undefined) r[k] = x;
  }
  const loss = opt(o['lossPct'], (x) => int(x));
  if (loss !== undefined) r.lossPct = loss;
  return r;
}

function sessionFrom(v: unknown): Session {
  const o = obj(v);
  const s: Session = {
    id: uuid(o['id']), repeater: repeaterFrom(o['repeater']), started: fromSwiftDate(num(o['started'])), proto: int(o['proto']),
    readings: arr(o['readings']).map(readingFrom), samples: arr(o['samples']).map(sampleFrom),
  };
  const txp = opt(o['txpDbm'], (x) => int(x));
  const fw = opt(o['fw'], str);
  if (txp !== undefined) s.txpDbm = txp;
  if (fw !== undefined) s.fw = fw;
  return s;
}

function decode<T>(text: string, f: (v: unknown) => T): T | undefined {
  try {
    return f(parseLenient(text));
  } catch {
    return undefined; // JSON inválido o tipos que no coinciden: como `try?` en Swift
  }
}

export const decodeRepeaters = (text: string): Repeater[] | undefined => decode(text, (v) => arr(v).map(repeaterFrom));
export const decodeSession = (text: string): Session | undefined => decode(text, sessionFrom);
