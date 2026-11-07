// FS-09: `String(Double)` de Swift usa los dígitos más cortos de ida y vuelta (como JS) pero SIEMPRE lleva parte decimal
// y pasa a notación científica fuera de [1e-4, 2^53) (medido en los dorados: 9999999999999998 → "9.999999999999998e+15"):
// 0 → "0.0", 1e-5 → "1e-05", 1e16 → "1e+16".

export function swiftDoubleDescription(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const sign = x < 0 ? '-' : '';
  const [mant, expText] = Math.abs(x).toExponential().split('e') as [string, string];
  const e = Math.trunc(Number(expText));
  const digits = mant.replace('.', '');
  if (e >= -4 && Math.abs(x) < 2 ** 53) {
    if (e >= 0) {
      const intPart = digits.length > e + 1 ? digits.slice(0, e + 1) : digits.padEnd(e + 1, '0');
      const frac = digits.length > e + 1 ? digits.slice(e + 1) : '0';
      return `${sign}${intPart}.${frac}`;
    }
    return `${sign}0.${'0'.repeat(-e - 1)}${digits}`;
  }
  const m = digits.length > 1 ? `${digits.slice(0, 1)}.${digits.slice(1)}` : digits;
  const ae = Math.abs(e);
  return `${sign}${m}e${e < 0 ? '-' : '+'}${ae < 10 ? '0' : ''}${ae}`;
}
