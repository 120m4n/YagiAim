// Geo.swift — cálculos geodésicos sobre esfera (suficiente para enlaces LoRa de < 200 km).
export interface Coordinate { latitude: number; longitude: number }

const EARTH_RADIUS = 6_371_008.8; // m (radio medio IUGG)

export const rad = (deg: number): number => (deg * Math.PI) / 180;
export const deg = (rad_: number): number => (rad_ * 180) / Math.PI;

/** Lleva un ángulo a [0, 360). Un negativo diminuto (-1e-18) no debe dar 360.0 por redondeo. */
export function normalize(d: number): number {
  const r = d % 360;
  const n = r < 0 ? r + 360 : r;
  return n >= 360 ? 0 : n;
}

/** Azimut inicial (rumbo verdadero, 0° = norte geográfico, sentido horario). */
export function bearing(a: Coordinate, b: Coordinate): number {
  const φ1 = rad(a.latitude);
  const φ2 = rad(b.latitude);
  const Δλ = rad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalize(deg(Math.atan2(y, x)));
}

/** Distancia de círculo máximo (haversine), en metros. */
export function distance(a: Coordinate, b: Coordinate): number {
  const φ1 = rad(a.latitude);
  const φ2 = rad(b.latitude);
  const Δφ = rad(b.latitude - a.latitude);
  const Δλ = rad(b.longitude - a.longitude);
  const h = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Elevación hacia el repetidor corrigiendo curvatura terrestre con k = 4/3. */
export function elevation(d: number, ownAltitude: number, targetAltitude: number): number {
  if (!(d > 1)) return 0;
  const effectiveRadius = (EARTH_RADIUS * 4.0) / 3.0;
  const drop = (d * d) / (2 * effectiveRadius);
  return deg(Math.atan2(targetAltitude - ownAltitude - drop, d));
}

/** Diferencia con signo en (-180, 180]: positivo = girar a la derecha. */
export function signedDelta(target: number, current: number): number {
  let d = (target - current) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Histéresis: entra a ±tolerancia y solo sale a ±(tolerancia + margen). */
export function isAligned(delta: number | undefined, tolerance: number, wasAligned: boolean, exitMargin = 2): boolean {
  if (delta === undefined) return false;
  return Math.abs(delta) <= (wasAligned ? tolerance + exitMargin : tolerance);
}

/** Rumbo medio circular en [0, 360); `undefined` si no hay datos o los vectores se anulan. */
export function circularMean(degrees: readonly number[]): number | undefined {
  if (degrees.length === 0) return undefined;
  const s = degrees.reduce((acc, d) => acc + Math.sin(rad(d)), 0);
  const c = degrees.reduce((acc, d) => acc + Math.cos(rad(d)), 0);
  if (!(Math.hypot(s, c) > 1e-9)) return undefined;
  return normalize(deg(Math.atan2(s, c)));
}

/** Mediana; con n par, el promedio de los dos centrales. No muta la entrada. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.trunc(v.length / 2);
  return v.length % 2 === 1 ? (v[m] as number) : ((v[m - 1] as number) + (v[m] as number)) / 2;
}

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

export function cardinal(d: number): string {
  return CARDINALS[Math.trunc((normalize(d) + 11.25) / 22.5) % 16] as string;
}

/** Ángulo continuo: lleva `next` al equivalente más cercano a `prev` (que puede haber acumulado vueltas), sin saltar al cruzar 0°/360°. */
export function unwrapAngle(prev: number, next: number): number {
  return prev + signedDelta(next, normalize(prev));
}
