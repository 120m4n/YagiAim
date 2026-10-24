// SF-01 (reinicio de las claves), RepeaterStore, LocationStore (EMA 0.25, offset, persistencia cada 5 s) y Haptics (token, reentrada).
import type { Location } from '../../src/core/aimInfo';
import { signedDelta } from '../../src/core/geo';
import type { HapticsDriver } from '../../src/native/haptics';
import { Haptics } from '../../src/platform/haptics';
import { Keys, Kv, memoryBackend } from '../../src/platform/kv';
import { LocationStore, headingOf, type LocationDriver } from '../../src/state/locationStore';
import { MotionStore } from '../../src/state/motionStore';
import { RepeaterStore } from '../../src/state/repeaterStore';
import { near } from '../helpers/near';

const r1 = { id: 'A0000000-0000-0000-0000-000000000001', name: 'Uno', latitude: 1, longitude: 2, hashPrefix: '4F' };
const r2 = { id: 'A0000000-0000-0000-0000-000000000002', name: 'Dos', latitude: 3, longitude: 4, altitude: 100 };

describe('RepeaterStore + Kv (reinicio)', () => {
  test('guarda en cada cambio y recupera tras reiniciar; delete reselecciona el primero', () => {
    const b = memoryBackend();
    const s = new RepeaterStore(new Kv(b));
    s.add(r1);
    s.add(r2);
    expect(s.selectedID).toBe(r2.id);
    const again = new RepeaterStore(new Kv(b)); // "reinicio"
    expect(again.repeaters).toEqual([r1, r2]);
    expect(again.selectedID).toBe(r2.id);
    again.delete(r2);
    expect(again.selectedID).toBe(r1.id);
    again.selectedID = undefined;
    expect(b.data.has(Keys.repeatersSelected)).toBe(false); // nil → borra la clave
  });
  test('JSON inválido → [] sin error; merge omite duplicados', () => {
    const b = memoryBackend();
    b.set(Keys.repeatersV1, '{no es json');
    const s = new RepeaterStore(new Kv(b));
    expect(s.repeaters).toEqual([]);
    s.add(r1);
    expect(s.merge([r1, r2])).toEqual({ added: 1, skipped: 1 });
  });
  test('update ignora ids desconocidos', () => {
    const s = new RepeaterStore(new Kv(memoryBackend()));
    s.update(r1);
    expect(s.repeaters).toEqual([]);
  });
});

const fix: Location = { latitude: 3.45, longitude: -76.53, altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: new Date(1_790_000_000_000) };
const driver: LocationDriver = {
  getAuthorization: async () => 'authorizedWhenInUse', requestAuthorization: async () => 'authorizedWhenInUse',
  startLocation: async () => () => undefined, headingAvailable: true, startHeading: () => () => undefined,
};

describe('LocationStore', () => {
  test('EMA circular α = 0.25: no salta al cruzar el norte y converge', () => {
    const l = new LocationStore(driver, new Kv(memoryBackend()));
    l.onHeading({ azimuth: 350, usingMagnetic: false, accuracy: 5 });
    near(l.rawHeading, 350, 1e-9); // la primera muestra no se filtra
    l.onHeading({ azimuth: 10, usingMagnetic: false, accuracy: 5 });
    expect(Math.abs(signedDelta(l.rawHeading as number, 350))).toBeLessThan(10); // avanza hacia 10° por el lado corto, sin pasar por 180°
    for (let i = 0; i < 60; i++) l.onHeading({ azimuth: 10, usingMagnetic: false, accuracy: 5 });
    near(l.rawHeading, 10, 1e-6);
  });
  test('precisión negativa: se publica pero no mueve el rumbo; norte magnético se refleja', () => {
    const l = new LocationStore(driver, new Kv(memoryBackend()));
    l.onHeading({ azimuth: 90, usingMagnetic: true, accuracy: 5 });
    expect(l.state.usingMagneticFallback).toBe(true);
    l.onHeading({ azimuth: 180, usingMagnetic: false, accuracy: -1 });
    expect(l.headingAccuracy).toBe(-1);
    near(l.rawHeading, 90, 1e-9);
    expect(l.state.usingMagneticFallback).toBe(true);
  });
  test('calibrate fija el offset y heading = normalize(raw + offset); se persiste en boom.offset', () => {
    const b = memoryBackend();
    const l = new LocationStore(driver, new Kv(b));
    l.calibrate(10); // sin rumbo: no hace nada
    expect(l.headingOffset).toBe(0);
    l.onHeading({ azimuth: 350, usingMagnetic: false, accuracy: 5 });
    l.calibrate(10);
    near(l.headingOffset, 20, 1e-9);
    near(l.heading, 10, 1e-9);
    expect(b.data.get(Keys.boomOffset)).toBe(l.headingOffset);
    expect(new LocationStore(driver, new Kv(b)).headingOffset).toBe(l.headingOffset);
    near(headingOf({ rawHeading: 350, headingOffset: 20 }), 10, 1e-9);
  });
  test('location.last se guarda como mucho cada 5 s y se restaura como "anterior"', () => {
    const b = memoryBackend();
    let now = 1_000_000;
    const l = new LocationStore(driver, new Kv(b), () => now);
    l.onLocation(fix);
    const first = b.data.get(Keys.locationLast);
    expect(first).toBeDefined();
    now += 4000;
    l.onLocation({ ...fix, latitude: 9 });
    expect(b.data.get(Keys.locationLast)).toBe(first); // dentro de los 5 s: no escribe
    now += 1500;
    l.onLocation({ ...fix, latitude: 9 });
    expect(JSON.parse(b.data.get(Keys.locationLast) as string).lat).toBe(9);
    const restored = new LocationStore(driver, new Kv(b));
    expect(restored.state.isCachedLocation).toBe(true);
    expect(restored.location?.latitude).toBe(9);
    restored.onLocation(fix);
    expect(restored.state.isCachedLocation).toBe(false);
  });
  test('descarta fixes sin precisión horizontal válida', () => {
    const l = new LocationStore(driver, new Kv(memoryBackend()));
    l.onLocation({ ...fix, horizontalAccuracy: -1 });
    expect(l.location).toBeUndefined();
  });
  test('si falta alguna clave de location.last se ignora entera', () => {
    const b = memoryBackend();
    b.set(Keys.locationLast, JSON.stringify({ lat: 1, lon: 2, alt: 3, h: 4, v: 5 }));
    expect(new LocationStore(driver, new Kv(b)).location).toBeUndefined();
  });
});

describe('MotionStore', () => {
  test('EMA 0.3 sobre el pitch, start no reentra y stop deja undefined', () => {
    let push: (p: number) => void = () => undefined;
    let started = 0;
    const m = new MotionStore({ available: true, start: (cb) => { started++; push = cb; return () => undefined; } });
    m.start(); m.start();
    expect(started).toBe(1);
    push(10);
    expect(m.pitch).toBe(10);
    push(20);
    near(m.pitch, 13, 1e-12);
    m.stop();
    expect(m.pitch).toBeUndefined();
  });
});

describe('Haptics (PM-10)', () => {
  function fake(amplitude = true) {
    const calls: string[] = [];
    const d: HapticsDriver = {
      hasAmplitudeControl: () => amplitude,
      vibrateWaveform: (t, a) => calls.push(`wave:${t.length}:${t.reduce((x, y) => x + y, 0)}:${a[0]}/${a[1]}`),
      cancel: () => calls.push('cancel'),
      notify: (k) => calls.push(`notify:${k}`),
    };
    return { d, calls };
  }
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test('ráfaga de 3 s = 6 ciclos de [40 ms a 255, 460 ms a 204]; no reentra mientras está activa; stop() cancela', () => {
    const { d, calls } = fake();
    const h = new Haptics(d);
    h.startAligned();
    h.startAligned();
    expect(calls).toEqual(['wave:12:3000:255/204']);
    h.stop();
    expect(calls).toEqual(['wave:12:3000:255/204', 'cancel']);
    h.startAligned();
    expect(calls).toHaveLength(3);
  });
  test('mientras siga alineado repite la ráfaga cada 3 s + 1,5 s de pausa; stop() corta los repetidos', () => {
    const { d, calls } = fake();
    const h = new Haptics(d);
    h.startAligned();
    jest.advanceTimersByTime(4400);
    expect(calls).toHaveLength(1);
    jest.advanceTimersByTime(100);
    expect(calls).toHaveLength(2);
    jest.advanceTimersByTime(9000);
    expect(calls).toHaveLength(4);
    expect(h.isActive).toBe(true);
    h.stop();
    jest.advanceTimersByTime(20000);
    expect(calls).toHaveLength(5); // 4 ráfagas + cancel
    expect(h.isActive).toBe(false);
  });
  test('un stop() seguido de otro startAligned() no hereda el temporizador de la anterior', () => {
    const { d, calls } = fake();
    const h = new Haptics(d);
    h.startAligned();
    jest.advanceTimersByTime(2000);
    h.stop();
    h.startAligned();
    jest.advanceTimersByTime(2500); // vencería la primera (4,5 s); la segunda solo lleva 2,5 s
    expect(calls.filter((c) => c.startsWith('wave'))).toHaveLength(2);
  });
  test('sin control de amplitud usa el equivalente de .success y también repite', () => {
    const { d, calls } = fake(false);
    const h = new Haptics(d);
    h.startAligned();
    h.startAligned();
    expect(calls).toEqual(['notify:success']);
    jest.advanceTimersByTime(4500);
    expect(calls).toEqual(['notify:success', 'notify:success']);
    h.stop();
    expect(h.isActive).toBe(false);
  });
});
