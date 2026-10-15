// Punto 2 — la calibración recupera un desfase y una escala conocidos a partir de orientaciones variadas.
import { MagCalibrator, applyCal, directionBin, type Vec3 } from '../../src/core/magCalibration';

// PRNG determinista
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function randomUnit(r: () => number): Vec3 {
  const z = 2 * r() - 1;
  const t = 2 * Math.PI * r();
  const q = Math.sqrt(1 - z * z);
  return [q * Math.cos(t), q * Math.sin(t), z];
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());

const F = 31;
const OFFSET: Vec3 = [35, -100, -200]; // como el imán del Redmi
const SCALE: Vec3 = [1.0, 0.92, 1.08]; // la lectura es s⁻¹·campo + desfase

function simulate(n: number, noise: number, seed: number, flat = false): Vec3[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    let u = randomUnit(r);
    if (flat) u = [Math.cos(2 * Math.PI * r()) * 0.9, Math.sin(2 * Math.PI * r()) * 0.9, 0.3 + 0.02 * gauss(r)];
    return [
      OFFSET[0] + (F * u[0]) / SCALE[0] + noise * gauss(r),
      OFFSET[1] + (F * u[1]) / SCALE[1] + noise * gauss(r),
      OFFSET[2] + (F * u[2]) / SCALE[2] + noise * gauss(r),
    ] as Vec3;
  });
}

test('recupera desfase y escala con orientaciones variadas y ruido de 0,3 µT', () => {
  const c = new MagCalibrator();
  for (const m of simulate(900, 0.3, 1)) c.add(m);
  const fit = c.fit(F)!;
  expect(fit.acceptable).toBe(true);
  expect(fit.coverage).toBeGreaterThanOrEqual(20);
  for (let k = 0; k < 3; k++) expect(Math.abs(fit.offset[k]! - OFFSET[k]!)).toBeLessThan(1.0);
  for (let k = 0; k < 3; k++) expect(Math.abs(fit.scale[k]! - SCALE[k]!)).toBeLessThan(0.03);
  expect(fit.rms).toBeLessThan(1);
  // el campo corregido tiene el módulo esperado
  const [x, y, z] = applyCal(fit, simulate(1, 0, 5)[0]!);
  expect(Math.abs(Math.hypot(x, y, z) - F)).toBeLessThan(1);
});

test('con el teléfono siempre plano (sin «ocho») no da por buena la calibración', () => {
  const c = new MagCalibrator();
  for (const m of simulate(900, 0.3, 2, true)) c.add(m);
  const fit = c.fit(F);
  expect(fit === undefined || fit.acceptable === false).toBe(true);
});

test('pocas muestras → sin ajuste', () => {
  const c = new MagCalibrator();
  for (const m of simulate(10, 0.3, 3)) c.add(m);
  expect(c.fit(F)).toBeUndefined();
});

test('rechaza muestras casi repetidas y respeta el máximo', () => {
  const c = new MagCalibrator({ maxSamples: 50 });
  expect(c.add([1, 2, 3])).toBe(true);
  expect(c.add([1.1, 2, 3])).toBe(false);
  for (const m of simulate(200, 0.3, 4)) c.add(m);
  expect(c.count).toBe(50);
});

test('directionBin: 26 casillas distintas', () => {
  const seen = new Set<number>();
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) seen.add(directionBin([x, y, z]));
  expect(seen.size).toBe(26);
  expect(Math.min(...seen)).toBe(0);
  expect(Math.max(...seen)).toBe(25);
});

// Regresión (prueba real en el Redmi): giro casi plano + ganancia 0,6 + imán fuerte no debe dar una solución degenerada.
test('fit: rotación casi plana con ganancia 0,6 conserva centro y escala razonables', () => {
  const r = rng(11);
  const c = new MagCalibrator();
  const off = [48, -84, -187];
  for (let i = 0; i < 600; i++) {
    const a = 2 * Math.PI * r();
    const z = 0.5 * (2 * r() - 1); // eje vertical con poca variación
    const q = Math.sqrt(1 - z * z);
    c.add([off[0]! + (31 * q * Math.cos(a)) / 0.6 + 0.3 * gauss(r), off[1]! + (31 * q * Math.sin(a)) / 0.6 + 0.3 * gauss(r), off[2]! + (31 * z) / 0.6 + 0.3 * gauss(r)]);
  }
  const fit = c.fit(31)!;
  expect(Math.hypot(fit.offset[0] - off[0]!, fit.offset[1] - off[1]!, fit.offset[2] - off[2]!)).toBeLessThan(8);
  for (const k of fit.scale) expect(Math.abs(k - 0.6)).toBeLessThan(0.15);
});
