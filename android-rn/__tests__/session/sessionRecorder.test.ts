// SessionRecorder.swift — precondiciones, pausa de "En vivo", muestras, guardado (con el pinger simulado y sensores falsos).
import type { Location } from '../../src/core/aimInfo';
import { PingerLink } from '../../src/link/pingerLink';
import { SimulatedPinger } from '../../src/link/simulatedPinger';
import { Kv, memoryBackend } from '../../src/platform/kv';
import { MeasureError, SessionRecorder } from '../../src/session/sessionRecorder';
import { SessionStore } from '../../src/session/sessionStore';
import { LocationStore, type LocationDriver } from '../../src/state/locationStore';
import type { FileStore } from '../../src/platform/files';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const fix: Location = { latitude: 3.45, longitude: -76.53, altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: new Date() };
const repeater = { id: 'A0000000-0000-0000-0000-000000000001', name: 'Cerro', latitude: 3.5, longitude: -76.6, hashPrefix: '4F' };

function memoryFiles(): FileStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    writeAtomic: (d, n, t) => void files.set(`${d}/${n}`, t),
    read: (d, n) => { const v = files.get(`${d}/${n}`); if (v === undefined) throw new Error('no existe'); return v; },
    list: (d) => [...files.keys()].filter((k) => k.startsWith(`${d}/`)).map((k) => k.slice(d.length + 1)),
    remove: (d, n) => void files.delete(`${d}/${n}`),
  };
}

const driver: LocationDriver = {
  getAuthorization: async () => 'authorizedWhenInUse', requestAuthorization: async () => 'authorizedWhenInUse',
  startLocation: async () => () => undefined, headingAvailable: true, startHeading: () => () => undefined,
};

function setup(o: { heading?: number | undefined; accuracy?: number; location?: Location | undefined } = {}) {
  const loc = new LocationStore(driver, new Kv(memoryBackend()));
  if ('location' in o ? o.location : fix) loc.onLocation(('location' in o ? o.location : fix) as Location);
  if (o.heading !== undefined) loc.onHeading({ azimuth: o.heading, usingMagnetic: false, accuracy: o.accuracy ?? 5 });
  else loc.onHeading({ azimuth: 62, usingMagnetic: false, accuracy: o.accuracy ?? 5 });
  const files = memoryFiles();
  const recorder = new SessionRecorder(new SessionStore(files));
  const link = new PingerLink(() => new SimulatedPinger({ delayScale: 0.01, lossProbability: 0 }, () => 62, () => 62));
  return { loc, recorder, link, files };
}

async function connect(link: PingerLink) {
  const p = link.connect({ id: '1', name: 'YagiPinger-SIM' }, '4F');
  await jest.advanceTimersByTimeAsync(400);
  await p;
}

const fail = (p: Promise<unknown>) => p.then(() => 'no falló', (e: unknown) => (e instanceof MeasureError ? e.reason : e));

test('precondiciones, en el orden de Swift', async () => {
  const s = setup();
  expect(await fail(s.recorder.measureHere(s.link, s.loc, repeater))).toBe('notReady');
  await connect(s.link);
  expect(await fail(s.recorder.measureHere(s.link, s.loc, { ...repeater, hashPrefix: undefined }))).toBe('noHash');
  const bad = setup({ accuracy: 20 });
  await connect(bad.link);
  expect(await fail(bad.recorder.measureHere(bad.link, bad.loc, repeater))).toBe('needsCalibration');
  const noLoc = setup({ location: undefined });
  await connect(noLoc.link);
  expect(await fail(noLoc.recorder.measureHere(noLoc.link, noLoc.loc, repeater))).toBe('noLocation');
});

test('mide 5 pings separados por max(2000 ms, rate), pausa y retoma "En vivo", guarda la sesión', async () => {
  const s = setup();
  await connect(s.link);
  s.link.startLive();
  await jest.advanceTimersByTimeAsync(50); // deja terminar el PING en vuelo (ver nota en el resumen: la carrera existe también en Swift)
  const done = s.recorder.measureHere(s.link, s.loc, repeater);
  expect(s.link.live).toBe(false); // pausado mientras mide
  let finished = false;
  void done.then(() => { finished = true; });
  await jest.advanceTimersByTimeAsync(2000 * 4 + 200);
  expect(finished).toBe(true);
  const reading = await done;
  expect(reading.index).toBe(1);
  expect(reading.stableCount).toBe(5);
  expect(reading.needsRepeat).toBe(false);
  expect(s.link.live).toBe(true); // retoma
  expect(s.recorder.current?.samples).toHaveLength(5);
  expect(s.recorder.current?.samples.every((x) => !x.unstable && !x.invalid && x.result.status === 'ok')).toBe(true);
  expect(s.files.files.size).toBe(1);
  expect([...s.files.files.keys()][0]).toMatch(/^Sessions\/[0-9A-F-]{36}\.json$/);
  // la 2.ª lectura se agrega a la misma sesión
  const second = s.recorder.measureHere(s.link, s.loc, repeater);
  await jest.advanceTimersByTimeAsync(2000 * 4 + 200);
  expect((await second).index).toBe(2);
  expect(s.recorder.current?.readings).toHaveLength(2);
  s.link.disconnect();
});

test('una medición en curso rechaza otra con "measuring"', async () => {
  const s = setup();
  await connect(s.link);
  const first = s.recorder.measureHere(s.link, s.loc, repeater);
  expect(await fail(s.recorder.measureHere(s.link, s.loc, repeater))).toBe('measuring');
  await jest.advanceTimersByTimeAsync(9000);
  await first;
  s.link.disconnect();
});

test('startSession() descarta la sesión actual', async () => {
  const s = setup();
  await connect(s.link);
  const m = s.recorder.measureHere(s.link, s.loc, repeater);
  await jest.advanceTimersByTimeAsync(9000);
  await m;
  s.recorder.startSession();
  expect(s.recorder.current).toBeUndefined();
  s.link.disconnect();
});
