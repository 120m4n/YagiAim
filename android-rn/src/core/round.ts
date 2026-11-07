/** `Double.rounded()` de Swift: al más cercano, empate lejos de cero (FS-04). `Math.round(-2.5)` daría -2. */
export function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** `Double.rounded(.towardZero)` y `Int(x)`. */
export const roundTowardZero = Math.trunc;
