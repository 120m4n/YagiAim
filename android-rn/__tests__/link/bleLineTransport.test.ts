// FR-031 / PM-09 / PM-12 — BleLineTransport con un mock del manejador BLE.
import { base64ToBytes, bytesToBase64 } from '../../src/link/base64';
import { BleLineTransport, NAME_PREFIX, OPEN_TIMEOUT_MS, RX_UUID, SERVICE_UUID, TX_UUID, type BleBackend } from '../../src/link/bleLineTransport';
import { Keys, Kv, memoryBackend } from '../../src/platform/kv';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

type Listener<T> = (e: null, v: T) => void;

function mockManager(opts: { mtu?: number; btState?: string; devices?: string[]; connectFails?: boolean } = {}) {
  const writes: Uint8Array[] = [];
  let notify: ((e: null, c: { value: string; uuid: string }) => void) | undefined;
  let disconnect: (() => void) | undefined;
  let scanListener: Listener<{ id: string; name: string | null; localName: string | null }> | undefined;
  const calls: string[] = [];
  const manager = {
    onStateChange: (l: (s: string) => void) => { setTimeout(() => l(opts.btState ?? 'PoweredOn'), 0); return { remove: () => undefined }; },
    startDeviceScan: async (uuids: string[] | null, _o: unknown, l: Listener<{ id: string; name: string | null; localName: string | null }>) => { calls.push(`scan:${uuids?.[0]}`); scanListener = l; },
    stopDeviceScan: async () => { calls.push('stopScan'); },
    connectToDevice: async (id: string, o?: { requestMTU?: number }) => {
      calls.push(`connect:${id}:mtu${o?.requestMTU}`);
      if (opts.connectFails) throw new Error('fail');
      return { id, mtu: opts.mtu ?? 247 };
    },
    cancelDeviceConnection: async (id: string) => { calls.push(`cancel:${id}`); return { id }; },
    onDeviceDisconnected: (_id: string, l: () => void) => { disconnect = l; return { remove: () => { disconnect = undefined; } }; },
    discoverAllServicesAndCharacteristicsForDevice: async (id: string) => ({ id, mtu: opts.mtu ?? 247 }),
    monitorCharacteristicForDevice: (_id: string, svc: string, ch: string, l: typeof notify) => { expect([svc, ch]).toEqual([SERVICE_UUID, TX_UUID]); notify = l; return { remove: () => { notify = undefined; } }; },
    writeCharacteristicWithoutResponseForDevice: async (_id: string, svc: string, ch: string, b64: string) => { expect([svc, ch]).toEqual([SERVICE_UUID, RX_UUID]); writes.push(base64ToBytes(b64)); return {}; },
  };
  return {
    manager: manager as unknown as BleBackend, writes, calls,
    advertise: (id: string, name: string) => scanListener?.(null, { id, name, localName: name }),
    notify: (text: string | number[]) => notify?.(null, { uuid: TX_UUID, value: bytesToBase64(typeof text === 'string' ? Uint8Array.from(Buffer.from(text)) : Uint8Array.from(text)) }),
    drop: () => disconnect?.(),
  };
}

const make = (m: ReturnType<typeof mockManager>, kv = new Kv(memoryBackend()), target?: string, ok = true) =>
  ({ t: new BleLineTransport({ manager: m.manager, kv, ensurePermissions: async () => ok }, target), kv });

async function collect<T>(s: AsyncIterable<T>, into: T[]) { for await (const v of s) into.push(v); }

test('base64 ida y vuelta', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'HELLO\n', '\u0000ÿ\u0080']) {
    const b = Uint8Array.from(Buffer.from(s, 'latin1'));
    expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
    expect([...base64ToBytes(Buffer.from(b).toString('base64'))]).toEqual([...b]);
  }
});

test('escaneo por servicio NUS: solo YagiPinger-*, ordenados por nombre', async () => {
  const m = mockManager();
  const { t } = make(m);
  const seen: unknown[] = [];
  void collect(t.devices, seen);
  t.startScan();
  await jest.advanceTimersByTimeAsync(10);
  expect(m.calls).toContain(`scan:${SERVICE_UUID}`);
  m.advertise('B', `${NAME_PREFIX}2222`);
  m.advertise('X', 'OtroDispositivo');
  m.advertise('A', `${NAME_PREFIX}1111`);
  await jest.advanceTimersByTimeAsync(0);
  expect(seen.at(-1)).toEqual([{ id: 'A', name: 'YagiPinger-1111' }, { id: 'B', name: 'YagiPinger-2222' }]);
  expect(t.state.kind).toBe('scanning');
  t.close();
});

test('Bluetooth apagado o sin permiso mientras se escanea → failed(bluetoothOff/unauthorized)', async () => {
  const off = make(mockManager({ btState: 'PoweredOff' }));
  off.t.startScan();
  await jest.advanceTimersByTimeAsync(10);
  expect(off.t.state).toEqual({ kind: 'failed', error: { kind: 'bluetoothOff' } });
  const denied = make(mockManager(), undefined, undefined, false);
  denied.t.startScan();
  await jest.advanceTimersByTimeAsync(10);
  expect(denied.t.state).toEqual({ kind: 'failed', error: { kind: 'unauthorized' } });
});

test('open() conecta al primero que aparezca, pide MTU 247, guarda lastDevice y entrega líneas fragmentadas', async () => {
  const m = mockManager();
  const { t, kv } = make(m);
  const lines: string[] = [];
  void collect(t.lines, lines);
  const opened = t.open();
  await jest.advanceTimersByTimeAsync(10);
  m.advertise('AA:BB', `${NAME_PREFIX}1A2B`);
  await jest.advanceTimersByTimeAsync(10);
  await opened;
  expect(t.state.kind).toBe('ready');
  expect(m.calls).toContain('connect:AA:BB:mtu247');
  expect(kv.getString(Keys.pingerLastDevice)).toBe('AA:BB');

  m.notify('#OK go\nP,1,AB');
  m.notify('CD,ok\r\n');
  m.notify([0x63, 0x61, 0x66, 0xc3]); // "caf" + primer byte de "é"
  m.notify([0xa9, 0x0a]);
  await jest.advanceTimersByTimeAsync(0);
  expect(lines).toEqual(['#OK go', 'P,1,ABCD,ok', 'café']);
  t.close();
});

test('con un dispositivo objetivo conecta directo por su dirección (sin escanear)', async () => {
  const m = mockManager();
  const { t } = make(m, undefined, 'AA:BB');
  const opened = t.open();
  await jest.advanceTimersByTimeAsync(10);
  await opened;
  expect(m.calls).toContain('connect:AA:BB:mtu247');
  expect(m.calls.some((c) => c.startsWith('scan:'))).toBe(false);
  t.close();
});

test.each([[247, 244], [23, 20], [10, 20]])('send() fragmenta en trozos de max(mtu − 3, 20) en orden: mtu %i → %i B', async (mtu, chunk) => {
  const m = mockManager({ mtu });
  const { t } = make(m, undefined, 'AA:BB');
  const opened = t.open();
  await jest.advanceTimersByTimeAsync(10);
  await opened;
  const line = 'x'.repeat(158);
  await t.send(line);
  const sizes = m.writes.map((w) => w.length);
  expect(sizes.every((n, i) => (i < sizes.length - 1 ? n === chunk : n <= chunk))).toBe(true);
  expect(Buffer.concat(m.writes).toString()).toBe(`${line}\n`);
  t.close();
});

test('timeout de apertura de 10 s: deviceNotFound si no vio ninguno, timeout si vio alguno', async () => {
  const none = make(mockManager());
  const p1 = none.t.open().catch((e: unknown) => e);
  await jest.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 10);
  expect(await p1).toEqual({ kind: 'deviceNotFound' });

  // intentó conectar a un periférico pero la conexión no se completa: `timeout`
  const m = mockManager();
  (m.manager as unknown as { connectToDevice: () => Promise<never> }).connectToDevice = () => new Promise<never>(() => undefined);
  const seen = make(m, undefined, 'AA:BB');
  const p2 = seen.t.open().catch((e: unknown) => e);
  await jest.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 10);
  expect(await p2).toEqual({ kind: 'timeout' });
});

test('desconexión → failed(connectionLost) y reabrir reutiliza el mismo periférico', async () => {
  const m = mockManager();
  const { t } = make(m, undefined, 'AA:BB');
  const states: string[] = [];
  void collect(t.states, { push: (s: { kind: string }) => states.push(s.kind) } as unknown as unknown[]);
  const opened = t.open();
  await jest.advanceTimersByTimeAsync(10);
  await opened;
  m.drop();
  expect(t.state).toEqual({ kind: 'failed', error: { kind: 'connectionLost' } });
  await expect(t.send('PING')).rejects.toEqual({ kind: 'connectionLost' });
  const again = t.open();
  await jest.advanceTimersByTimeAsync(10);
  await again;
  expect(t.state.kind).toBe('ready');
  expect(m.calls.filter((c) => c.startsWith('connect:')).length).toBe(2);
  t.close();
});
