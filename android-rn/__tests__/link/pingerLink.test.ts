// Paridad de comportamiento de PingerLink.swift (L76–289) con temporizadores falsos.
import { PingerLink, isPingerError } from '../../src/link/pingerLink';
import { SimulatedPinger } from '../../src/link/simulatedPinger';
import { isLinkError } from '../../src/link/lineTransport';
import { ScriptedTransport, goodPinger } from '../helpers/scriptedTransport';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => jest.advanceTimersByTimeAsync(0);
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

function connected(t = new ScriptedTransport(goodPinger()), hash: string | null = '4F') {
  const link = new PingerLink(() => t);
  return { link, t, up: async () => { const p = link.connect({ id: 'AA:BB', name: 'YagiPinger-1A2B' }, hash ?? undefined); await advance(50); await p; } };
}

test('el handshake envía HELLO, STOP, MON off, CFG? y SET hash en ese orden', async () => {
  const { link, t, up } = connected();
  await up();
  expect(t.sent).toEqual(['HELLO', 'STOP', 'MON off', 'CFG?', 'SET hash=4F']);
  expect(link.isOperational).toBe(true);
  expect(link.state.kind).toBe('ready');
  expect(link.device?.fw).toBe('sim');
  expect(link.config['rate']).toBe('1500');
});

test('sin hash no envía SET hash', async () => {
  const { link, t, up } = connected(undefined, null);
  await up();
  expect(t.sent).toEqual(['HELLO', 'STOP', 'MON off', 'CFG?']);
  expect(link.isOperational).toBe(true);
});

test('proto distinto de 1 → incompatibleFirmware', async () => {
  const { link, up } = connected(new ScriptedTransport(goodPinger(2)));
  await up();
  expect(link.state).toEqual({ kind: 'failed', error: { kind: 'incompatibleFirmware', proto: 2 } });
  expect(link.isOperational).toBe(false);
});

test('una segunda petición en curso falla con requestInFlight', async () => {
  const { link, up } = connected();
  await up();
  const first = link.configure('4F');
  await expect(link.configure('5A')).rejects.toEqual({ kind: 'requestInFlight' });
  await advance(10);
  await first;
});

test('sin respuesta, ping() falla con timeout a los 6 s', async () => {
  const { link, t, up } = connected();
  await up();
  const p = link.ping().catch((e: unknown) => e);
  await advance(5999);
  expect(t.sent.at(-1)).toBe('PING');
  await advance(2);
  expect(await p).toEqual({ kind: 'timeout' });
});

test('!ERR → rejected con código y detalle', async () => {
  const { link, up } = connected(new ScriptedTransport(goodPinger(1, (line, t) => line === 'PING' && t.emit('!ERR state busy'))));
  await up();
  const e = await link.ping().catch((x: unknown) => x);
  expect(e).toEqual({ kind: 'rejected', code: 'state', detail: 'busy' });
});

test('duty_wait entre el PING y su P, marca dutyWait y guarda el aviso', async () => {
  const { link, up } = connected(new ScriptedTransport(goodPinger(1, (line, t) => {
    if (line === 'PING') { t.emit('#WARN duty_wait 800'); t.emit('P,1,0000000A,ok,300,+9.25,+8.50,-35.0,1'); }
  })));
  await up();
  const r = await link.ping();
  expect(r.dutyWait).toBe(true);
  expect(r.result.snrUp).toBe(9.25);
  expect(link.lastWarning).toBe('duty_wait 800');
  expect(link.history).toHaveLength(1);
});

test('el historial guarda los últimos 30', async () => {
  const { link, up } = connected(new ScriptedTransport(goodPinger(1, (line, t) => line === 'PING' && t.emit(`P,${t.sent.length},0000000A,ok,300,+1.00,+1.00,-35.0,1`))));
  await up();
  for (let i = 0; i < 35; i++) await link.ping();
  expect(link.history).toHaveLength(30);
});

test('"En vivo": un PING por intervalo de max(2000 ms, rate); !ERR no lo detiene, otro error sí', async () => {
  let n = 0;
  const { link, t, up } = connected(new ScriptedTransport(goodPinger(1, (line, tr) => {
    if (line !== 'PING') return;
    n += 1;
    tr.emit(n === 2 ? '!ERR state busy' : `P,${n},0000000A,ok,300,+1.00,+1.00,-35.0,1`);
  })));
  await up();
  link.startLive();
  await advance(1);
  expect(t.sent.filter((l) => l === 'PING')).toHaveLength(1);
  await advance(1998); // t = 1999 ms
  expect(t.sent.filter((l) => l === 'PING')).toHaveLength(1);
  await advance(2); // t = 2001 ms
  expect(t.sent.filter((l) => l === 'PING')).toHaveLength(2); // el !ERR del 2.º no detiene
  await advance(2000);
  expect(t.sent.filter((l) => l === 'PING')).toHaveLength(3);
  expect(link.live).toBe(true);
  t.onSend = () => undefined; // deja de responder: el siguiente falla por timeout y corta el modo en vivo
  await advance(2000 + 6000 + 10);
  expect(link.live).toBe(false);
});

test('pérdida de conexión: reintenta 1→2→4 s, rehace el handshake y retoma "En vivo"', async () => {
  const t = new ScriptedTransport(goodPinger(1, (line, tr) => line === 'PING' && tr.emit('P,1,0000000A,ok,300,+1.00,+1.00,-35.0,1')));
  const link = new PingerLink(() => t);
  const p = link.connect(undefined, '4F');
  await advance(10);
  await p;
  link.startLive();
  await advance(10);
  expect(link.live).toBe(true);

  t.failOpenWith = { kind: 'deviceNotFound' };
  t.drop();
  await settle();
  expect(link.state).toEqual({ kind: 'failed', error: { kind: 'connectionLost' } });
  expect(link.live).toBe(false);
  const opens = t.opens;
  await advance(1000); // 1.er intento a 1 s: falla
  expect(t.opens).toBe(opens + 1);
  await advance(2000); // 2.º a 2 s
  expect(t.opens).toBe(opens + 2);
  await advance(4000); // 3.º a 4 s
  expect(t.opens).toBe(opens + 3);
  t.failOpenWith = undefined;
  await advance(4000); // 4.º (tope 4 s): conecta
  await advance(100);
  expect(t.opens).toBe(opens + 4);
  expect(link.isOperational).toBe(true);
  expect(link.live).toBe(true); // retoma "En vivo"
  link.disconnect();
});

test('proto incompatible durante la reconexión corta los reintentos', async () => {
  let proto = 1;
  const t = new ScriptedTransport((line, tr) => goodPinger(proto)(line, tr));
  const link = new PingerLink(() => t);
  const p = link.connect(undefined, '4F');
  await advance(10);
  await p;
  proto = 2;
  t.drop();
  await advance(1000 + 50);
  expect(link.state).toEqual({ kind: 'failed', error: { kind: 'incompatibleFirmware', proto: 2 } });
  const opens = t.opens;
  await advance(20_000);
  expect(t.opens).toBe(opens);
});

test('disconnect() limpia todo', async () => {
  const { link, t, up } = connected();
  await up();
  link.startLive();
  link.disconnect();
  expect(link.state.kind).toBe('idle');
  expect(link.live).toBe(false);
  expect(link.isOperational).toBe(false);
  expect(t.state.kind).toBe('idle');
});

test('con el pinger simulado: ping extremo a extremo y SNR coherente con la semilla 1', async () => {
  const link = new PingerLink(() => new SimulatedPinger({ delayScale: 0.01 }, () => 40, () => 40));
  const p = link.connect(undefined, '4F');
  await advance(400);
  await p;
  expect(link.isOperational).toBe(true);
  const r = link.ping();
  await advance(100);
  const rep = await r;
  expect(['ok', 'timeout']).toContain(rep.result.status);
  expect(isPingerError({ kind: 'rejected', code: 'x' })).toBe(true);
  expect(isLinkError({ kind: 'timeout' })).toBe(true);
  link.disconnect();
});
