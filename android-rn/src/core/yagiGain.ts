import { rad } from './geo';

/** Ganancia relativa (dB, ≤ 0) del patrón de Yagi para un ángulo fuera de eje: 10·log10(max(cos(δ/2)^(2n), 10^(−FB/10))). */
export function yagiGain(deltaDeg: number, n = 8, fbDB = 12): number {
  const c = Math.max(Math.cos(rad(deltaDeg) / 2), 0);
  return 10 * Math.log10(Math.max(Math.pow(c, 2 * n), Math.pow(10, -fbDB / 10)));
}
