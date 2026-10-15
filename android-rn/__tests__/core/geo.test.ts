// Port 1:1 de MeshAzimuthTests/GeoTests.swift (12 casos).
import { bearing, cardinal, circularMean, distance, isAligned, median, normalize, signedDelta } from '../../src/core/geo';
import { near } from '../helpers/near';

const cali = { latitude: 3.4516, longitude: -76.532 };
const bogota = { latitude: 4.711, longitude: -74.0721 };

test('cardinalBearings', () => {
  const o = { latitude: 0, longitude: 0 };
  near(bearing(o, { latitude: 1, longitude: 0 }), 0, 1e-9);
  near(bearing(o, { latitude: 0, longitude: 1 }), 90, 1e-9);
  near(bearing(o, { latitude: -1, longitude: 0 }), 180, 1e-9);
  near(bearing(o, { latitude: 0, longitude: -1 }), 270, 1e-9);
});

test('caliToBogota', () => {
  // Referencia esférica independiente (Python): 62.75°, 306.67 km
  near(bearing(cali, bogota), 62.75, 0.01);
  near(distance(cali, bogota) / 1000, 306.67, 0.01);
});

test('signedDeltaWraps', () => {
  near(signedDelta(10, 350), 20, 1e-9);
  near(signedDelta(350, 10), -20, 1e-9);
  near(signedDelta(180, 0), 180, 1e-9);
});

test('cardinalNames', () => {
  expect(cardinal(0)).toBe('N');
  expect(cardinal(359)).toBe('N');
  expect(cardinal(225)).toBe('SO');
});

test('alignmentHysteresis', () => {
  // Entra a ±3, se mantiene hasta ±5, sale por encima.
  expect(isAligned(4, 3, false)).toBe(false);
  expect(isAligned(2.9, 3, false)).toBe(true);
  expect(isAligned(4.5, 3, true)).toBe(true);
  expect(isAligned(5.5, 3, true)).toBe(false);
  expect(isAligned(undefined, 3, true)).toBe(false);
});

test('normalizeNeverReturns360', () => {
  expect(normalize(-1e-18)).toBe(0); // r + 360 se redondea a 360.0 exacto
  expect(normalize(360)).toBe(0);
  near(normalize(-90), 270, 1e-9);
});

test('circularMeanAcrossNorth', () => {
  near(circularMean([359, 1]), 0, 1e-9); // no 180
  near(circularMean([358, 2, 0]), 0, 1e-9);
  // 350° y 10° se anulan en seno; con 30°: atan2(0.5, 2.8356) = 10° (el promedio aritmético daría 130°)
  near(circularMean([350, 10, 30]), 10, 1e-9);
});

test('circularMeanOrdinaryCases', () => {
  near(circularMean([10, 20, 30]), 20, 1e-9);
  near(circularMean([90]), 90, 1e-9);
  near(circularMean([270, 270]), 270, 1e-9);
});

test('circularMeanResultIsInZeroTo360', () => {
  for (const set of [[359, 1], [355, 5, 0], [180, 181], [0.0001, 359.9999]]) {
    const m = circularMean(set) as number;
    expect(m >= 0 && m < 360).toBe(true);
  }
});

test('circularMeanUndefinedCases', () => {
  expect(circularMean([])).toBeUndefined();
  expect(circularMean([0, 180])).toBeUndefined(); // vectores opuestos: no hay rumbo medio
});

test('medianOddEvenSingleEmpty', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(2.5); // n par: promedio de los centrales
  expect(median([5])).toBe(5);
  expect(median([])).toBeUndefined();
});

test('medianWithNegativesAndUnsortedInput', () => {
  near(median([-4.5, -6.25]), -5.375, 1e-12);
  expect(median([9, -3, 4, 4, 100])).toBe(4);
  const input = [3, 1, 2];
  median(input);
  expect(input).toEqual([3, 1, 2]); // no muta la entrada
});
