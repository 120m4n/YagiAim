// Puntos 3 y 4 — la fusión corrige el rumbo con un imán fuerte en el teléfono, distingue interferencia y no parpadea.
import { HeadingFusion, tiltCompensatedAzimuth, type FusionEnv, type SensorSample } from '../../src/core/headingFusion';
import { signedDelta } from '../../src/core/geo';
import type { Vec3 } from '../../src/core/magCalibration';
import { magneticField } from '../../src/core/wmm';

const RAD = Math.PI / 180;
const FIELD = magneticField(7.1, -73.1, 1.0, 2026.79); // D −9,66°, I 29,7°, F 31 µT
const ENV: FusionEnv = { field: { declination: FIELD.declination, inclination: FIELD.inclination, total: FIELD.total }, liveFix: true };
const MAGNET: Vec3 = [35, -100, -200]; // imán del propio teléfono (como el Redmi A5)
const DRIVER_BIAS_ERROR: Vec3 = [17, -12, 8]; // lo que se equivoca el sesgo que resta el controlador

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Ejes del teléfono en el mundo (este, norte verdaderos, arriba) para azimut ψ, cabeceo θ y alabeo φ. */
function axes(psi: number, theta: number, phi: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const p = psi * RAD, t = theta * RAD, f = phi * RAD;
  const y: Vec3 = [Math.sin(p) * Math.cos(t), Math.cos(p) * Math.cos(t), Math.sin(t)];
  const x0: Vec3 = [Math.cos(p), -Math.sin(p), 0];
  const z0 = cross(x0, y);
  const x: Vec3 = [x0[0] * Math.cos(f) + z0[0] * Math.sin(f), x0[1] * Math.cos(f) + z0[1] * Math.sin(f), x0[2] * Math.cos(f) + z0[2] * Math.sin(f)];
  const z = cross(x, y);
  return { x, y, z };
}

interface Pose { psi: number; theta: number; phi: number; interference?: Vec3 }

function sample(t: number, pose: Pose, r: () => number, rvDrift = 0): SensorSample {
  const { x, y, z } = axes(pose.psi, pose.theta, pose.phi);
  const toPhone = (v: Vec3): Vec3 => [dot(v, x), dot(v, y), dot(v, z)];
  const earth = toPhone([FIELD.east, FIELD.north, -FIELD.down]); // campo hacia el norte magnético
  const intf = pose.interference ? toPhone(pose.interference) : [0, 0, 0];
  const n = () => 0.15 * gauss(r);
  const mUncal: Vec3 = [earth[0] + intf[0] + MAGNET[0] + n(), earth[1] + intf[1] + MAGNET[1] + n(), earth[2] + intf[2] + MAGNET[2] + n()];
  const mDriver: Vec3 = [mUncal[0] - MAGNET[0] - DRIVER_BIAS_ERROR[0], mUncal[1] - MAGNET[1] - DRIVER_BIAS_ERROR[1], mUncal[2] - MAGNET[2] - DRIVER_BIAS_ERROR[2]];
  const g = toPhone([0, 0, 9.81]);
  const gMeas: Vec3 = [g[0] + 0.02 * gauss(r), g[1] + 0.02 * gauss(r), g[2] + 0.02 * gauss(r)];
  // vector de rotación del sistema: el azimut que sale del campo "calibrado" por el controlador (con su sesgo equivocado)
  const rv = tiltCompensatedAzimuth(gMeas, mDriver)! + rvDrift;
  return { tNs: Math.round(t * 1e9), g: gMeas, mUncal, mDriver, rvAzimuth: rv };
}

// En la simulación los ejes del mundo son los verdaderos (este/norte geográficos), así que el azimut del teléfono ψ ya es el verdadero.
const trueAzimuth = (psi: number) => psi;

/** 50 s moviendo el teléfono en todas direcciones («ocho») para calibrar. */
function figureEight(f: HeadingFusion, r: () => number, t0: number): number {
  let t = t0;
  for (let i = 0; i < 20 * 50; i++, t += 0.05) {
    const u = i / 20;
    f.process(sample(t, { psi: (u * 40) % 360, theta: 60 * Math.sin(u * 0.9), phi: 80 * Math.sin(u * 0.55 + 1) }, r), ENV);
  }
  return t;
}

test('sin calibración propia el rumbo del sistema tiene un error grande (el problema real)', () => {
  const r = rng(1);
  const errors: number[] = [];
  for (let psi = 0; psi < 360; psi += 15) errors.push(signedDelta(sample(0, { psi, theta: 0, phi: 0 }, r).rvAzimuth!, psi));
  expect(Math.max(...errors.map(Math.abs))).toBeGreaterThan(15);
});

test('tras el «ocho» el rumbo verdadero queda a menos de 4° girando a 10°/s (un giro rápido) y cruza el norte sin saltos', () => {
  const r = rng(2);
  const f = new HeadingFusion();
  let t = figureEight(f, r, 0);
  expect(f.calibration).toBeDefined();
  expect(f.calibration!.rms).toBeLessThan(1);
  let prev: number | undefined;
  let worst = 0;
  let maxStep = 0;
  for (let psi = 330; psi <= 330 + 360; psi += 0.5, t += 0.05) {
    const out = f.process(sample(t, { psi: psi % 360, theta: 3, phi: -2 }, r), ENV)!;
    const err = Math.abs(signedDelta(out.azimuth, trueAzimuth(psi % 360)));
    if (psi > 340) worst = Math.max(worst, err); // deja asentarse la corrección lenta
    if (prev !== undefined && psi > 340) maxStep = Math.max(maxStep, Math.abs(signedDelta(out.azimuth, prev))); // el primer paso es un salto del propio test
    prev = out.azimuth;
  }
  expect(worst).toBeLessThan(4); // incluye el retardo del suavizado al girar (≈ velocidad × 0,15 s)
  expect(maxStep).toBeLessThan(2);
});

test('quieto: el rumbo no parpadea (desviación < 0,3°) y la precisión es válida y estable', () => {
  const r = rng(3);
  const f = new HeadingFusion();
  let t = figureEight(f, r, 0);
  const az: number[] = [];
  const acc: number[] = [];
  for (let i = 0; i < 20 * 60; i++, t += 0.05) {
    const o = f.process(sample(t, { psi: 123, theta: 1, phi: 0 }, r), ENV)!;
    if (i > 100) { az.push(o.azimuth); acc.push(o.accuracy); }
  }
  const mean = az.reduce((a, b) => a + b) / az.length;
  const sd = Math.sqrt(az.reduce((a, b) => a + (b - mean) ** 2, 0) / az.length);
  expect(sd).toBeLessThan(0.3);
  expect(Math.max(...acc)).toBeLessThanOrEqual(15);
  expect(acc.every((a) => a <= 15)).toBe(true);
});

test('antes del «ocho», con el sensor desviado, la precisión indica «calibra» (> 15°)', () => {
  const r = rng(4);
  const f = new HeadingFusion();
  let last = 0;
  for (let i = 0; i < 20 * 20; i++) last = f.process(sample(i * 0.05, { psi: 40, theta: 0, phi: 0 }, r), ENV)!.accuracy;
  expect(last).toBeGreaterThan(15);
});

test('interferencia local: la precisión sube por encima de 15° y vuelve al retirarla, sin alternar', () => {
  const r = rng(5);
  const f = new HeadingFusion();
  let t = figureEight(f, r, 0);
  const valid: boolean[] = [];
  const seq = (n: number, interference?: Vec3) => {
    for (let i = 0; i < n; i++, t += 0.05) valid.push(f.process(sample(t, { psi: 200, theta: 0, phi: 0, ...(interference && { interference }) }, r), ENV)!.accuracy <= 15);
  };
  seq(200); // limpio
  seq(200, [20, 15, -10]); // metal cerca: +25 µT
  seq(300);
  const flips = valid.slice(1).filter((v, i) => v !== valid[i]).length;
  expect(valid.slice(0, 200).every(Boolean)).toBe(true);
  expect(valid.slice(260, 400).every((v) => !v)).toBe(true);
  expect(valid.slice(-100).every(Boolean)).toBe(true);
  expect(flips).toBeLessThanOrEqual(2); // una caída y una recuperación
});

test('sin ubicación: norte magnético, sin ajuste y precisión no válida; con ubicación de la sesión anterior: sigue magnético', () => {
  const r = rng(6);
  const f = new HeadingFusion();
  const none = f.process(sample(0, { psi: 90, theta: 0, phi: 0 }, r), { liveFix: false })!;
  expect(none.usingMagnetic).toBe(true);
  expect(none.accuracy).toBeGreaterThan(15);
  const cached = new HeadingFusion().process(sample(0, { psi: 90, theta: 0, phi: 0 }, r), { ...ENV, liveFix: false })!;
  expect(cached.usingMagnetic).toBe(true);
  expect(cached.debug.magneticAzimuth).toBeCloseTo(cached.azimuth, 5); // sin declinación aplicada
});

test('sin vector de rotación usa el azimut propio suavizado', () => {
  const r = rng(7);
  const f = new HeadingFusion();
  let t = figureEight(f, r, 0);
  let out;
  for (let i = 0; i < 200; i++, t += 0.05) {
    const { rvAzimuth: _rv, ...s } = sample(t, { psi: 250, theta: 0, phi: 0 }, r);
    void _rv;
    out = f.process(s, ENV)!;
  }
  expect(Math.abs(signedDelta(out!.azimuth, trueAzimuth(250)))).toBeLessThan(2);
});

test('una calibración inicial guardada evita el «ocho» tras reiniciar', () => {
  const r = rng(8);
  const first = new HeadingFusion();
  figureEight(first, r, 0);
  const saved = first.calibration!;
  const second = new HeadingFusion({ initialCal: saved });
  let out;
  for (let i = 0; i < 100; i++) out = second.process(sample(i * 0.05, { psi: 300, theta: 0, phi: 0 }, r), ENV)!;
  expect(Math.abs(signedDelta(out!.azimuth, trueAzimuth(300)))).toBeLessThan(2);
  expect(out!.accuracy).toBeLessThanOrEqual(15);
});

test('respuesta a un escalón de 30°: 90 % en menos de 0,6 s', () => {
  const r = rng(9);
  const f = new HeadingFusion();
  let t = figureEight(f, r, 0);
  for (let i = 0; i < 100; i++, t += 0.05) f.process(sample(t, { psi: 100, theta: 0, phi: 0 }, r), ENV);
  let t90: number | undefined;
  for (let i = 0; i < 40; i++, t += 0.05) {
    const o = f.process(sample(t, { psi: 130, theta: 0, phi: 0 }, r), ENV)!;
    if (t90 === undefined && o.azimuth >= 127) t90 = (i + 1) * 0.05;
  }
  expect(t90).toBeDefined();
  expect(t90!).toBeLessThanOrEqual(0.6);
});
