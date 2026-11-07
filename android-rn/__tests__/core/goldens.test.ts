// Paridad con los dorados generados en Swift (tools/goldens, R-13). Si un contrato y el dorado discrepan, manda el dorado.
import { aimInfo, distanceText } from '../../src/core/aimInfo';
import { formatByteCount } from '../../src/core/byteCount';
import { formatAbbreviatedShortened, type DateLocale } from '../../src/core/dateStyle';
import { formatC, formatFixed } from '../../src/core/formatC';
import { bearing, cardinal, circularMean, distance, elevation, isAligned, median, normalize, signedDelta } from '../../src/core/geo';
import { LineAssembler } from '../../src/core/lineAssembler';
import { parse, type PingerEvent } from '../../src/core/lineCodec';
import { mergeRepeaters, normalizedHashPrefix, type Repeater } from '../../src/core/repeater';
import { roundHalfAwayFromZero, roundTowardZero } from '../../src/core/round';
import { csvEscape, csvFileName, isoString, makeCsv, fixedTimeZone } from '../../src/core/sessionCsv';
import { headingIsValid, makeReading, makeSample } from '../../src/core/sessionModels';
import type { Sample, Session } from '../../src/core/sessionModels';
import { SplitMix64 } from '../../src/core/splitmix64';
import { swiftDoubleDescription } from '../../src/core/swiftDescribe';
import { decodeRepeaters, encodeRepeaters, encodeRepeatersPretty, encodeSession, decodeSession } from '../../src/core/swiftJson';
import { parseSwiftDouble, parseSwiftInt } from '../../src/core/swiftParse';
import { localizedCaseInsensitiveCompare, localizedCaseInsensitiveContains } from '../../src/core/textMatch';
import { parseUuid } from '../../src/core/uuid';
import { utf8Decode } from '../../src/core/utf8';
import { splitGraphemes, splitGraphemesFallback } from '../../src/core/graphemes';
import { yagiGain } from '../../src/core/yagiGain';
import { bits, bitsOpt, fromBits, G } from '../helpers/goldens';

// Los cálculos trigonométricos pueden diferir en el último ulp entre libm y V8: tolerancia relativa de 1e-12.
const close = (a: number | undefined, goldBits: string | null, tol = 1e-12) => {
  if (goldBits === null) return expect(a).toBeUndefined();
  const g = fromBits(goldBits);
  expect(a).toBeDefined();
  expect(Math.abs((a as number) - g)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(g)));
};

describe('FS-01 formatC', () => {
  test('tabla de casos', () => {
    for (const c of G.formatC.table) expect({ spec: c.spec, v: c.value, out: formatC(c.spec, fromBits(c.value)) }).toEqual({ spec: c.spec, v: c.value, out: c.out });
  });
  test('todos los cuartos de dB con %+.2f', () => {
    G.formatC.quartersPlus2.forEach((out: string, i: number) => expect(formatFixed((i - 128) / 4, 2, true)).toBe(out));
  });
  test('todos los décimos en [-130, 0] con %+.1f y %.1f', () => {
    G.formatC.tenthsPlus1.forEach((out: string, i: number) => expect(formatFixed((i - 1300) / 10, 1, true)).toBe(out));
    G.formatC.tenths1.forEach((out: string, i: number) => expect(formatFixed((i - 1300) / 10, 1)).toBe(out));
  });
  test('aleatorios (1800 valores)', () => {
    for (const c of G.formatC.random) expect(formatC(c.spec, fromBits(c.value))).toBe(c.out);
  });
  test('%08X y %d', () => {
    for (const c of G.formatC.hex) expect(formatC('%08X', Number(c.value))).toBe(c.out);
    for (const c of G.formatC.int) expect(formatC('%d', Number(c.value))).toBe(c.out);
  });
  test('casos nombrados del spec', () => {
    expect(formatC('%.2f', 0.125)).toBe('0.12');
    expect(formatC('%+.2f', -0.0)).toBe('-0.00');
    expect(formatC('%.1f', 61.25)).toBe('61.2');
  });
});

describe('FS-02/FS-03 parseo', () => {
  test('Double(String)', () => {
    for (const c of G.parseDouble) {
      const v = parseSwiftDouble(c.in);
      if (c.out === 'nil') expect({ in: c.in, v }).toEqual({ in: c.in, v: undefined });
      else if (Number.isNaN(fromBits(c.out))) expect(Number.isNaN(v)).toBe(true);
      else expect({ in: c.in, v: v === undefined ? v : bits(v) }).toEqual({ in: c.in, v: c.out });
    }
  });
  test('Int(String)', () => {
    // Int de Swift tiene 64 bits; el número de JS solo es exacto hasta 2^53 (la app solo usa enteros pequeños).
    for (const c of G.parseInt) expect({ in: c.in, v: parseSwiftInt(c.in) ?? 'nil' }).toEqual({ in: c.in, v: c.out === 'nil' ? 'nil' : Number(c.out) });
  });
});

describe('FS-04 redondeo', () => {
  test('rounded y towardZero', () => {
    for (const c of G.rounded) {
      const x = fromBits(c.in);
      expect(bits(roundHalfAwayFromZero(x))).toBe(c.away);
      expect(bits(roundTowardZero(x))).toBe(c.zero);
    }
  });
});

describe('FS-09 String(Double)', () => {
  test('descripción de Swift', () => {
    for (const c of G.describe) expect({ v: c.value, out: swiftDoubleDescription(fromBits(c.value)) }).toEqual({ v: c.value, out: c.out });
  });
});

describe('Geo / AimInfo', () => {
  test('rumbo y distancia entre 400 pares', () => {
    for (const p of G.geoPairs) {
      const a = { latitude: p.a[0], longitude: p.a[1] };
      const b = { latitude: p.b[0], longitude: p.b[1] };
      close(bearing(a, b), p.bearing, 1e-9);
      close(distance(a, b), p.distance, 1e-9);
    }
  });
  test('elevación, normalize, signedDelta, cardinal, circularMean, median, isAligned', () => {
    for (const c of G.elevation) close(elevation(fromBits(c.d), fromBits(c.h1), fromBits(c.h2)), c.out, 1e-9);
    for (const c of G.normalize) expect(bits(normalize(fromBits(c.in)))).toBe(c.out);
    for (const c of G.signedDelta) expect(bits(signedDelta(fromBits(c.t), fromBits(c.c)))).toBe(c.out);
    for (const c of G.cardinal) expect(cardinal(fromBits(c.in))).toBe(c.out);
    for (const c of G.circularMean) close(circularMean(c.in.map(fromBits)), c.out, 1e-12);
    for (const c of G.median) expect(bitsOpt(median(c.in.map(fromBits)))).toBe(c.out);
    for (const c of G.isAligned) expect(isAligned(fromBits(c.delta), fromBits(c.tol), c.was)).toBe(c.out);
  });
  test('AimInfo', () => {
    const me = { latitude: 3.4516, longitude: -76.532, altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: new Date() };
    const meNoV = { ...me, verticalAccuracy: -1 };
    const rep: Repeater = { id: 'A', name: 'R', latitude: 4.711, longitude: -74.0721, altitude: 2600 };
    const noAlt: Repeater = { id: rep.id, name: rep.name, latitude: rep.latitude, longitude: rep.longitude };
    const near: Repeater = { id: 'B', name: 'N', latitude: 3.452, longitude: -76.532, altitude: 1005 };
    const cases: Record<string, ReturnType<typeof aimInfo>> = {
      full: aimInfo(me, rep, 40), noHeading: aimInfo(me, rep, undefined), noAlt: aimInfo(me, noAlt, 40), noVertical: aimInfo(meNoV, rep, 40), near: aimInfo(me, near, 62),
    };
    for (const g of G.aimInfo) {
      const i = cases[g.case] as NonNullable<(typeof cases)[string]>;
      close(i.bearing, g.bearing, 1e-9);
      close(i.distance, g.distance, 1e-9);
      close(i.elevation, g.elevation, 1e-9);
      close(i.delta, g.delta, 1e-9);
      expect(distanceText(i)).toBe(g.text);
    }
  });
});

describe('SC-007 SplitMix64 y patrón Yagi', () => {
  test('next / uniform / gaussian con la semilla 1', () => {
    const r = new SplitMix64(1n);
    G.splitmix64_next.forEach((s: string) => expect(r.next().toString()).toBe(s));
    const u = new SplitMix64(1n);
    G.splitmix64_uniform.forEach((b: string) => expect(bits(u.uniform())).toBe(b));
    const g = new SplitMix64(1n);
    G.splitmix64_gaussian.forEach((b: string) => close(g.gaussian(), b, 1e-12));
  });
  test('semilla máxima (envoltura de 64 bits)', () => {
    const r = new SplitMix64(0xffff_ffff_ffff_ffffn);
    G.splitmix64_maxseed.forEach((s: string) => expect(r.next().toString()).toBe(s));
  });
  test('yagiGain', () => {
    for (const c of G.yagiGain) close(yagiGain(fromBits(c.d), fromBits(c.n), fromBits(c.fb)), c.out, 1e-12);
  });
});

describe('Repetidores', () => {
  test('normalizedHashPrefix', () => {
    for (const c of G.hashPrefix) expect({ in: c.in, out: normalizedHashPrefix(c.in) ?? null }).toEqual({ in: c.in, out: c.out });
  });
  test('merge', () => {
    const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const rp = (n: number, name: string, lat: number, lon: number, alt?: number, hash?: string): Repeater => ({ id: id(n), name, latitude: lat, longitude: lon, ...(alt !== undefined && { altitude: alt }), ...(hash && { hashPrefix: hash }) });
    const existing = [rp(1, 'A', 1, 2), rp(2, 'B', 3, 4, 100, '4F')];
    const incoming = [rp(1, 'other', 9, 9), rp(3, 'A', 1, 2), rp(4, 'C', 5, 6), rp(4, 'C2', 7, 8), rp(5, '', 1, 1), rp(6, 'D', 91, 0), rp(7, 'E', 0, 181), rp(8, 'F', -90, 180), rp(9, 'C', 5, 6)];
    const m = mergeRepeaters(existing, incoming);
    expect({ added: m.added, skipped: m.skipped, ids: m.list.map((r) => r.id), names: m.list.map((r) => r.name) }).toEqual(G.merge);
  });
  test('JSON exportado idéntico byte a byte (SF-03)', () => {
    const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const rp = (n: number, name: string, lat: number, lon: number, alt?: number, hash?: string): Repeater => ({ id: id(n), name, latitude: lat, longitude: lon, ...(alt !== undefined && { altitude: alt }), ...(hash && { hashPrefix: hash }) });
    const list = [
      rp(1, 'pico de la vieja', 6.8403, -73.2265, 1012, '9A'), rp(2, 'sin opcionales', 0, 0), rp(3, 'num -0', -0, 1e-5), rp(4, 'grande', 1e16, 123456789.123),
      rp(5, 'enteros', -73, 45, 1012.5), rp(6, 'a/b', 0.1, 1e21), rp(7, 'ñ😀', 3.4516, -76.532), rp(8, 'q"uote', 1, 1), rp(9, 'back\\slash', 1, 1),
      rp(10, 'ctl\t\n\r\u0001\u007f\b\f', 1, 1), rp(11, 'sep  é', 1, 1), rp(12, 'x', 0.00001234, -0.0001),
    ];
    expect(encodeRepeatersPretty(list)).toBe(G.jsonRepeaters.pretty);
    expect(encodeRepeaters(list)).toBe(G.jsonRepeaters.sorted);
    expect(encodeRepeatersPretty([])).toBe(G.jsonRepeaters.prettyEmpty);
    expect(encodeRepeatersPretty([list[0] as Repeater])).toBe(G.jsonRepeaters.prettySingle);
    expect(encodeRepeatersPretty([list[1] as Repeater])).toBe(G.jsonRepeaters.prettyNoOptional);
  });
  test('decodificación como JSONDecoder (SF-03)', () => {
    for (const c of G.jsonRepeaterDecode) {
      const list = decodeRepeaters(c.in);
      expect({ in: c.in, ok: list !== undefined, out: list && encodeRepeaters(list) }).toEqual({ in: c.in, ok: c.ok, out: c.ok ? c.out : undefined });
    }
  });
  test('UUID', () => {
    for (const c of G.uuid) expect({ in: c.in, out: parseUuid(c.in) ?? null }).toEqual({ in: c.in, out: c.out });
  });
});

describe('LineCodec', () => {
  const canon = (e: PingerEvent): string => {
    const d = (x: number | undefined) => (x === undefined ? '-' : bits(x));
    switch (e.kind) {
      case 'hello': return `hello|${e.fw}|${e.proto}|${e.radio}|${e.id}`;
      case 'cfg': return `cfg|${Object.keys(e.values).sort().map((k) => `${k}=${e.values[k]}`).join(';')}`;
      case 'ok': return `ok|${e.text}`;
      case 'warn': return `warn|${e.code}|${e.detail ?? '-'}`;
      case 'error': return `error|${e.code}|${e.detail ?? '-'}`;
      case 'ping': { const r = e.result; return `ping|${r.seq}|${r.tag}|${r.status}|${r.rttMs ?? '-'}|${d(r.snrUp)}|${d(r.snrDn)}|${d(r.rssiDn)}|${r.nResp}`; }
      case 'summary': { const s = e.summary; return `summary|${s.n}|${s.ok}|${s.lossPct ?? '-'}|${d(s.medSnrUp)}|${d(s.medSnrDn)}|${d(s.medRssiDn)}|${s.busy}`; }
      case 'raw': return `raw|${e.frame.tMs}|${d(e.frame.rssi)}|${d(e.frame.snr)}|${e.frame.hex}|${e.frame.truncated}`;
      case 'unknown': return `unknown|${e.line}`;
    }
  };
  test('151 líneas (FS-02…FS-05) producen el mismo evento que Swift', () => {
    for (const c of G.parseLines) expect({ in: c.in, out: canon(parse(c.in)) }).toEqual({ in: c.in, out: c.out });
  });
  test('UTF-8 inválido (FS-06)', () => {
    for (const c of G.utf8) {
      const lines = new LineAssembler().feed(Uint8Array.from([0x78, ...c.bytes, 0x79, 0x0a]));
      expect({ bytes: c.bytes, cps: [...(lines[0] ?? '')].map((ch) => ch.codePointAt(0)) }).toEqual({ bytes: c.bytes, cps: c.out });
      expect(utf8Decode(Uint8Array.from([0x78, ...c.bytes, 0x79]))).toBe(lines[0]);
    }
  });
});

describe('Sesión: CSV y reglas', () => {
  const date = (iso: string) => new Date(iso);
  function sampleOf(idx: number, o: { ok?: boolean; unstable?: boolean; invalid?: boolean } = {}): Sample {
    const ok = o.ok ?? true;
    return {
      id: `AAAAAAAA-0000-0000-0000-${String(idx).padStart(12, '0')}`, readingIndex: idx > 2 ? 2 : 1, tTx: date('2026-10-15T07:12:03.215-05:00'), tRx: date('2026-10-15T07:12:04.600-05:00'),
      headingTx: 61.04, headingRx: 61.5, headingAccuracy: 5, latitude: 3.4516, longitude: -76.532, altitude: 1012.34, hAccuracy: 4.8, targetBearing: 62.75, delta: 1.7,
      unstable: o.unstable ?? false, invalid: o.invalid ?? false,
      result: { seq: idx, tag: 'AABBCCDD', status: ok ? 'ok' : 'timeout', nResp: ok ? 1 : 0, ...(ok ? { rttMs: 300, snrUp: 9.25, snrDn: -0.5, rssiDn: -108 } : {}) },
    };
  }
  const sessionOf = (samples: Sample[], name = 'Cerro Pico'): Session => ({
    id: 'BBBBBBBB-0000-0000-0000-000000000001', repeater: { id: '00000000-0000-0000-0000-000000000001', name, latitude: 3.5, longitude: -76.6, hashPrefix: '4F' },
    started: date('2026-10-15T07:12:03.215-05:00'), txpDbm: 22, fw: '0.1.0', proto: 1, readings: [], samples,
  });
  const tzs: [string, number][] = [['-05:00', -300], ['UTC', 0], ['+05:30', 330], ['-00:30', -30]];
  const example = sessionOf([sampleOf(1), sampleOf(2, { unstable: true }), sampleOf(3, { invalid: true }), sampleOf(4, { ok: false })]);

  test('CSV de ejemplo idéntico byte a byte al de iOS (SC-003) en 4 zonas', () => {
    for (const [i, [name, min]] of tzs.entries()) {
      const g = G.csvExample[i];
      expect(g.tz).toBe(name);
      expect(makeCsv(example, fixedTimeZone(min))).toBe(g.csv);
      expect(csvFileName(example, fixedTimeZone(min))).toBe(g.fileName);
    }
  });
  test('altitud ausente y redondeos en el borde', () => {
    const s = sampleOf(1);
    const edge: Sample = { ...s, result: { ...s.result, snrUp: -0.004, rssiDn: -0.04 } };
    delete edge.altitude;
    expect(makeCsv(sessionOf([edge]), fixedTimeZone(-300))).toBe(G.csvEdge);
  });
  test('escapado RFC 4180 como Swift (grafemas)', () => {
    for (const c of G.csvEscape) expect({ in: c.in, out: csvEscape(c.in) }).toEqual({ in: c.in, out: c.out });
  });
  test('nombre de archivo seguro por grafema (FS-08)', () => {
    for (const c of G.csvFileName) expect({ in: c.in, out: csvFileName(sessionOf([], c.in), fixedTimeZone(-300)) }).toEqual({ in: c.in, out: c.out });
  });
  test('aproximación de grafemas sin Intl.Segmenter coincide en los casos de FS-08', () => {
    for (const s of ['Cerro El Pico/Cali ñ', 'ñ', 'ñ', '🇨🇴', '👨‍👩‍👧', 'a\r\nb', '👍🏽']) expect(splitGraphemesFallback(s)).toEqual(splitGraphemes(s));
  });
  test('ISO 8601 con milisegundos y zona', () => {
    for (const row of G.isoMillis) {
      const ms = Math.floor(fromBits(row.epoch) * 1000);
      if (Math.abs(fromBits(row.epoch) * 1000 - Math.round(fromBits(row.epoch) * 1000)) > 1e-6) continue; // fracciones sub-ms: JS Date no las representa
      for (const [name, min] of tzs) expect(isoString(new Date(Math.round(fromBits(row.epoch) * 1000)), fixedTimeZone(min))).toBe(row[name]);
      void ms;
    }
  });
  test('JSON de sesión (SF-04): codifica igual y decodifica ida y vuelta', () => {
    const withReading: Session = { ...example, readings: [] };
    // Swift calcula los instantes como Double (813759123.2149999); aquí son ms enteros (…123.215): se comparan con 1 ms de tolerancia.
    const norm = (json: string) => JSON.parse(json.replace(/"(tTx|tRx|started)":([0-9.]+)/g, (_m, k: string, v: string) => `"${k}":${Math.round(Number(v) * 1000)}`));
    expect(norm(encodeSession(withReading))).toEqual(norm(G.sessionJson));
    const back = decodeSession(G.sessionJson);
    expect(back && norm(encodeSession(back))).toEqual(norm(G.sessionJson));
  });
  test('SessionRules', () => {
    const here = { latitude: 3.45, longitude: -76.53, altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: new Date() };
    const hereNoV = { ...here, verticalAccuracy: -1 };
    const rep = (status: 'ok' | 'timeout' | 'busy' | 'txerr' = 'ok', up = -6.25, dn = -4.5, rssi = -108, duty = false) => ({
      result: { seq: 1, tag: 'AABBCCDD', status, nResp: status === 'ok' ? 1 : 0, ...(status === 'ok' ? { rttMs: 300, snrUp: up, snrDn: dn, rssiDn: rssi } : {}) },
      tTx: new Date(), tRx: new Date(), dutyWait: duty,
    });
    const sample = (r: ReturnType<typeof rep>, o: { hTx?: number; moved?: number; target?: number; loc?: typeof here } = {}) => {
      const h = o.hTx ?? 100;
      return makeSample({ readingIndex: 1, report: r, headingTx: h, headingRx: normalize(h + (o.moved ?? 0)), headingAccuracy: 5, location: o.loc ?? here, targetBearing: o.target ?? 100 });
    };
    const samples = [sample(rep(), { moved: 2.0 }), sample(rep(), { moved: 2.1 }), sample(rep(), { moved: -3 }), sample(rep(), { hTx: 359, moved: 2 }), sample(rep(), { hTx: 359, moved: 4 }),
      sample(rep('ok', -6.25, -4.5, -108, true)), sample(rep(), { hTx: 350, target: 10 }), sample(rep(), { hTx: 10, target: 350 }), sample(rep(), { loc: hereNoV })];
    samples.forEach((s, i) => {
      const g = G.sessionRules.samples[i];
      expect({ unstable: s.unstable, invalid: s.invalid, delta: bits(s.delta), altitude: bitsOpt(s.altitude), hAccuracy: bits(s.hAccuracy), headingRx: bits(s.headingRx) }).toEqual(g);
    });
    const ups = [-6.25, -6.0, -5.75, -6.5, -6.25];
    const cases: Record<string, Sample[]> = {
      five: ups.map((u) => sample(rep('ok', u, u + 2, u * 10))),
      even: [-6.25, -4.5, -3.0, -8.0].map((u) => sample(rep('ok', u))),
      dutyExcluded: [0, 1, 2, 3].map(() => sample(rep('ok', -6.0))).concat(sample(rep('ok', 20.0, -4.5, -108, true))),
      unstableExcluded: [0, 1, 2].map(() => sample(rep('ok', -6.0))).concat([0, 1].map(() => sample(rep('ok', 15.0), { moved: 3 }))),
      fewStable: [sample(rep()), sample(rep())].concat([0, 1, 2].map(() => sample(rep(), { moved: 5 }))),
      noneUsable: [0, 1, 2].map(() => sample(rep('timeout'))),
      lossFifth: [sample(rep()), sample(rep()), sample(rep()), sample(rep()), sample(rep('timeout'))],
      lossThird: [sample(rep()), sample(rep()), sample(rep('timeout')), sample(rep('busy'))],
      lossNone: [sample(rep('busy')), sample(rep('txerr'))],
      lossEighth: [0, 1, 2, 3, 4, 5, 6].map(() => sample(rep())).concat(sample(rep('timeout'))),
      meanHeadingNorth: [358, 2, 0].map((h) => sample(rep(), { hTx: h, target: h })),
      meanDeltaOpposite: [sample(rep(), { hTx: 100, target: 279 }), sample(rep(), { hTx: 100, target: 100 - 179 })],
      empty: [],
    };
    for (const g of G.sessionRules.readings) {
      const r = makeReading(1, cases[g.case] as Sample[]);
      close(r.meanHeading, g.reading.meanHeading); close(r.meanDelta, g.reading.meanDelta);
      expect(bitsOpt(r.medSnrUp)).toBe(g.reading.medSnrUp); expect(bitsOpt(r.medSnrDn)).toBe(g.reading.medSnrDn); expect(bitsOpt(r.medRssiDn)).toBe(g.reading.medRssiDn);
      expect({ loss: r.lossPct ?? null, stable: r.stableCount, repeat: r.needsRepeat }).toEqual({ loss: g.reading.lossPct, stable: g.reading.stableCount, repeat: g.reading.needsRepeat });
    }
    for (const c of G.sessionRules.headingValid) expect(headingIsValid(fromBits(c.in))).toBe(c.out);
  });
});

describe('FS-07 fechas, FS-10 tamaño de caché, FS-11 búsqueda', () => {
  test('Date.formatted(.abbreviated, .shortened) en es_CO y en_US', () => {
    for (const c of G.dateStyle as { locale: string; case: string; epochMs: number; out: string }[]) {
      if (c.locale !== 'es_CO' && c.locale !== 'en_US') continue;
      expect({ ...c, out: formatAbbreviatedShortened(new Date(c.epochMs), c.locale as DateLocale, fixedTimeZone(-300)) }).toEqual(c);
    }
  });
  test('ByteCountFormatter(.file)', () => {
    for (const [loc, tag] of [['es_CO', 'es-CO'], ['en_US', 'en-US']] as const) {
      for (const c of G.locale[loc].byteCount) expect({ loc, bytes: c.bytes, out: formatByteCount(BigInt(c.bytes), tag) }).toEqual({ loc, bytes: c.bytes, out: c.text });
    }
  });
  test('localizedCaseInsensitiveContains / Compare / orden', () => {
    for (const [loc, tag] of [['es_CO', 'es-CO'], ['en_US', 'en-US']] as const) {
      const g = G.locale[loc];
      for (const c of g.contains) expect({ loc, hay: c.hay, needle: c.needle, r: localizedCaseInsensitiveContains(c.hay, c.needle, tag) }).toEqual({ loc, hay: c.hay, needle: c.needle, r: c.result });
      for (const c of g.compare) expect({ loc, a: c.a, b: c.b, r: localizedCaseInsensitiveCompare(c.a, c.b, tag) }).toEqual({ loc, a: c.a, b: c.b, r: c.result });
      const sorted = [...g.sortInput].sort((a: string, b: string) => localizedCaseInsensitiveCompare(a, b, tag));
      expect({ loc, sorted }).toEqual({ loc, sorted: g.sorted });
    }
  });
});
