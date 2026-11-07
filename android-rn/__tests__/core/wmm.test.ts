// Punto 1 del plan de norte magnético — el WMM2025 en TypeScript coincide con la referencia (pygeomag).
import { decimalYear, magneticField } from '../../src/core/wmm';
import ref from '../goldens/wmm-goldens.json';

test('declinación, inclinación e intensidad coinciden con pygeomag en 49 puntos', () => {
  for (const p of ref) {
    const f = magneticField(p.lat, p.lon, p.altKm, p.year);
    const where = `${p.lat},${p.lon},${p.altKm},${p.year}`;
    expect({ where, d: Math.abs(f.declination - p.d) }).toEqual({ where, d: expect.any(Number) });
    expect(Math.abs(f.declination - p.d)).toBeLessThan(0.02);
    expect(Math.abs(f.inclination - p.i)).toBeLessThan(0.02);
    expect(Math.abs(f.total * 1000 - p.f)).toBeLessThan(5); // nT
    expect(Math.abs(f.horizontal * 1000 - p.h)).toBeLessThan(5);
  }
});

test('tu zona (Santander, octubre de 2026): D ≈ −9,7°, I ≈ 29,7°, F ≈ 31 µT', () => {
  const f = magneticField(7.1, -73.1, 1.0, decimalYear(new Date('2026-10-15T12:00:00Z')));
  expect(f.declination).toBeCloseTo(-9.66, 1);
  expect(f.inclination).toBeCloseTo(29.65, 0);
  expect(f.total).toBeCloseTo(31.0, 0);
});

test('decimalYear', () => {
  expect(decimalYear(new Date('2026-01-01T00:00:00Z'))).toBeCloseTo(2026, 6);
  expect(decimalYear(new Date('2026-07-02T12:00:00Z'))).toBeCloseTo(2026.5, 2);
});
