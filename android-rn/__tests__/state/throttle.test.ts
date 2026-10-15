// Plan D — actualización limitada con histéresis.
import { createStore } from 'zustand/vanilla';
import { angleChanged, followThrottled, numberChanged } from '../../src/state/throttle';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('entrega como mucho cada intervalMs y siempre el último valor', () => {
  const store = createStore(() => ({ v: 0 }));
  const got: number[] = [];
  const stop = followThrottled(store, (s) => s.v, { intervalMs: 200, changed: numberChanged(1) }, (v) => got.push(v));
  store.setState({ v: 5 }); // primera: inmediata
  expect(got).toEqual([5]);
  for (let i = 6; i <= 20; i++) store.setState({ v: i }); // ráfaga dentro de la ventana
  expect(got).toEqual([5]);
  jest.advanceTimersByTime(199);
  expect(got).toEqual([5]);
  jest.advanceTimersByTime(2);
  expect(got).toEqual([5, 20]);
  stop();
  store.setState({ v: 99 });
  jest.advanceTimersByTime(1000);
  expect(got).toEqual([5, 20]);
});

test('la histéresis ignora variaciones menores que el umbral', () => {
  const store = createStore<{ h: number | undefined }>(() => ({ h: 100 }));
  const got: (number | undefined)[] = [];
  followThrottled(store, (s) => s.h, { intervalMs: 0, changed: angleChanged(0.7) }, (v) => got.push(v));
  store.setState({ h: 100.5 });
  store.setState({ h: 99.5 });
  expect(got).toEqual([]);
  store.setState({ h: 100.8 });
  expect(got).toEqual([100.8]);
  store.setState({ h: undefined });
  expect(got).toEqual([100.8, undefined]);
});

test('angleChanged mide por el camino corto', () => {
  expect(angleChanged(0.7)(359.8, 0.2)).toBe(false); // 0.4°
  expect(angleChanged(0.7)(359.5, 0.5)).toBe(true); // 1.0°
});
