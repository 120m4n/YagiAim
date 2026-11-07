// Port 1:1 de MeshAzimuthTests/LineCodecTests.swift (16 casos), con los MISMOS fixtures que el firmware.
import { LineAssembler } from '../../src/core/lineAssembler';
import { parse, type PingerEvent } from '../../src/core/lineCodec';
import { loadFixtures } from '../helpers/fixtures';

const int = (j: Record<string, unknown>, k: string) => (typeof j[k] === 'number' ? (j[k] as number) : undefined);

/** Quita las claves con valor `undefined` para comparar con `toEqual` sin ruido. */
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

test('pingFixturesParseToTheExpectedResult', () => {
  const fx = loadFixtures('events_p.txt');
  expect(fx.length).toBeGreaterThanOrEqual(7);
  for (const f of fx) {
    const j = f.json;
    const want: PingerEvent = {
      kind: 'ping',
      result: clean({
        seq: int(j, 'seq') as number, tag: j['tag'] as string, status: j['status'] as 'ok', rttMs: int(j, 'rtt_ms'),
        snrUp: int(j, 'snr_up'), snrDn: int(j, 'snr_dn'), rssiDn: int(j, 'rssi_dn'), nResp: int(j, 'n_resp') as number,
      }),
    };
    expect(clean(parse(f.line))).toEqual(want);
  }
});

test('summaryFixturesParseToTheExpectedSummary', () => {
  const fx = loadFixtures('events_s.txt');
  expect(fx.length).toBeGreaterThanOrEqual(7);
  for (const f of fx) {
    const j = f.json;
    const want: PingerEvent = {
      kind: 'summary',
      summary: clean({
        n: int(j, 'n') as number, ok: int(j, 'ok') as number, lossPct: int(j, 'loss_pct'), medSnrUp: int(j, 'med_snr_up'),
        medSnrDn: int(j, 'med_snr_dn'), medRssiDn: int(j, 'med_rssi_dn'), busy: int(j, 'busy') as number,
      }),
    };
    expect(clean(parse(f.line))).toEqual(want);
  }
});

test('rawFixturesParseToTheExpectedFrame', () => {
  const fx = loadFixtures('events_r.txt');
  expect(fx.length).toBeGreaterThanOrEqual(5);
  for (const f of fx) {
    const j = f.json;
    let hex = j['hex'] as string;
    if (hex.endsWith('..')) hex = hex.slice(0, -2);
    expect(parse(f.line)).toEqual({
      kind: 'raw',
      frame: { tMs: int(j, 't_ms'), rssi: int(j, 'rssi'), snr: int(j, 'snr'), hex, truncated: (j['truncated'] as boolean | undefined) ?? false },
    });
  }
});

test('infoFixturesParseToTheExpectedEvent', () => {
  const fx = loadFixtures('info.txt');
  expect(fx.length).toBeGreaterThanOrEqual(20);
  for (const f of fx) {
    const j = f.json;
    let want: PingerEvent;
    switch (j['type']) {
      case 'HELLO': want = { kind: 'hello', fw: j['fw'] as string, proto: int(j, 'proto') as number, radio: j['radio'] as string, id: j['id'] as string }; break;
      case 'CFG': {
        const values: Record<string, string> = {};
        for (const [k, v] of Object.entries(j)) if (k !== 'type') values[k] = typeof v === 'string' ? v : String(v); // números del JSON como texto
        want = { kind: 'cfg', values };
        break;
      }
      case 'OK': want = { kind: 'ok', text: typeof j['text'] === 'string' ? j['text'] : `${j['key'] as string}=${j['value'] as string}` }; break;
      case 'WARN': want = clean({ kind: 'warn', code: j['code'] as string, detail: j['detail'] as string | undefined }); break;
      case 'ERR': want = clean({ kind: 'error', code: j['code'] as string, detail: j['detail'] as string | undefined }); break;
      default: throw new Error(`tipo desconocido en ${f.where}`);
    }
    expect(clean(parse(f.line))).toEqual(want);
  }
});

test('everyCommandReplyIsRecognisedWithItsErrorCode', () => {
  const fx = loadFixtures('commands.txt');
  expect(fx.length).toBeGreaterThanOrEqual(40);
  for (const f of fx) {
    for (const key of ['reply', 'reply2']) {
      const reply = f.json[key];
      if (typeof reply !== 'string') continue;
      const ev = parse(reply);
      expect({ where: f.where, reply, kind: ev.kind }).not.toEqual({ where: f.where, reply, kind: 'unknown' });
      if (ev.kind === 'error' && typeof f.json['error'] === 'string') expect(ev.code).toBe(f.json['error']);
    }
  }
});

test('unknownPrefixesAreKeptAsUnknown', () => {
  for (const line of ['X,1,2', '#FOO bar', 'hello world', '', '?', 'p,1,00000001,ok,1,+1.00,+1.00,-50.0,1']) {
    expect(parse(line)).toEqual({ kind: 'unknown', line });
  }
});

test('malformedKnownLinesBecomeUnknown', () => {
  const bad = [
    'P,1,2', // pocos campos
    'P,x,00000001,ok,1,+1.00,+1.00,-50.0,1', // seq no numérico
    'P,1,ZZZZZZZZ,ok,1,+1.00,+1.00,-50.0,1', // tag no hex
    'P,1,0000001,ok,1,+1.00,+1.00,-50.0,1', // tag de 7 dígitos
    'P,1,00000001,maybe,1,+1.00,+1.00,-50.0,1', // status inválido
    'P,1,00000001,ok,,,,,1', // ok sin medidas
    'P,1,00000001,ok,1,nan,+1.00,-50.0,1', // NaN no es un número válido
    'P,1,00000001,ok,1,+1.00,+1.00,-50.0,300', // n_resp fuera de UInt8
    'S,5,5', // resumen truncado
    'S,a,5,0,,,,0',
    'R,1,2',
    'R,1,-1.0,+1.0,ZZ', // hex inválido
    'R,1,-1.0,+1.0,ABC', // hex de longitud impar
    '#HELLO fw=0.1.0', // faltan campos
    '#HELLO fw=0.1.0 proto=x radio=SX1262 id=ABCDEF',
    '!ERR',
    '#OK',
  ];
  for (const line of bad) expect({ line, ev: parse(line) }).toEqual({ line, ev: { kind: 'unknown', line } });
});

test('extraTrailingFieldsAreTolerated', () => {
  const p = parse('P,7,0000000A,ok,300,+9.25,+8.50,-35.0,1,extra');
  expect(p.kind).toBe('ping');
  if (p.kind === 'ping') expect(p.result.seq).toBe(7);
  const h = parse('#HELLO fw=0.2.0 proto=1 radio=SX1262 id=ABCDEF new=1');
  expect(h.kind).toBe('hello');
  if (h.kind === 'hello') expect(h.proto).toBe(1);
});

test('summaryWithoutBusyFieldDefaultsToZero', () => {
  const s = parse('S,5,5,0,-6.25,-4.50,-108.0');
  expect(s.kind).toBe('summary');
  if (s.kind === 'summary') expect(s.summary.busy).toBe(0);
});

test('carriageReturnIsIgnored', () => {
  expect(parse('#OK go\r')).toEqual({ kind: 'ok', text: 'go' });
});

test('reassemblesALineSplitAcrossNotifications', () => {
  const a = new LineAssembler();
  expect(a.feed('P,1,AB')).toEqual([]);
  expect(a.feed('CD,ok\nP,2,EF')).toEqual(['P,1,ABCD,ok']);
  expect(a.feed('\n')).toEqual(['P,2,EF']);
});

test('severalLinesInOneNotification', () => {
  expect(new LineAssembler().feed('#OK go\nP,1,x\n#OK stop\n')).toEqual(['#OK go', 'P,1,x', '#OK stop']);
});

test('crlfAndEmptyLines', () => {
  expect(new LineAssembler().feed('A\r\n\r\n\nB\r\n')).toEqual(['A', 'B']);
});

test('dataInputAndMultiByteCharacterSplitAcrossChunks', () => {
  const a = new LineAssembler();
  const bytes = Uint8Array.from(Buffer.from('café\n', 'utf8')); // "é" ocupa 2 bytes
  expect(a.feed(bytes.subarray(0, 4))).toEqual([]); // corta en medio de la "é"
  expect(a.feed(bytes.subarray(4))).toEqual(['café']);
});

test('lineAtTheLimitIsAcceptedAndLongerIsDiscarded', () => {
  const a = new LineAssembler();
  const ok = 'a'.repeat(159); // 159 + '\n' = 160 B, el máximo
  expect(a.feed(`${ok}\n`)).toEqual([ok]);
  expect(a.overflowCount).toBe(0);
  expect(a.feed(`${'b'.repeat(160)}\nOK\n`)).toEqual(['OK']); // se descarta la larga y se sigue
  expect(a.overflowCount).toBe(1);
});

test('overflowAcrossChunksResynchronisesAtNextNewline', () => {
  const a = new LineAssembler();
  expect(a.feed('x'.repeat(100))).toEqual([]);
  expect(a.feed('x'.repeat(100))).toEqual([]); // ya pasó del tope: descartando
  expect(a.feed(`${'x'.repeat(50)}\nnext\n`)).toEqual(['next']);
  expect(a.overflowCount).toBe(1);
});
