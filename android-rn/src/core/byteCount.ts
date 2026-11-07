// FS-10: `ByteCountFormatter` con `countStyle = .file`. Unidades decimales (1 KB = 1000 B). Reglas medidas en los dorados
// (es_CO y en_US): "Zero KB" para 0; bytes sin decimales; KB 0 decimales, MB 1, GB y superiores 2; los ceros finales se
// omiten; redondeo "mitad hacia arriba" sobre el cociente decimal exacto (1.005 GB → 1.01 GB); si el valor redondeado
// llega a 1000 se pasa a la unidad siguiente. Los nombres de unidad salen en inglés en ambas regiones (así los entrega
// Foundation en el dorado); solo cambia el separador decimal.
const UNITS = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
const DECIMALS = [0, 1, 2, 2, 2, 2, 2, 2];

/** Separador decimal de la región (`1.1.toLocaleString`); "." si el motor no la conoce. */
export function decimalSeparator(locale?: string): string {
  try {
    const s = (1.1).toLocaleString(locale);
    return s.charAt(1) || '.';
  } catch {
    return '.';
  }
}

/** Redondea `n / 10^shift` a `decimals` decimales, mitad hacia arriba, con BigInt; devuelve el valor × 10^decimals. */
function scaled(n: bigint, shift: number, decimals: number): bigint {
  const num = n * 10n ** BigInt(decimals);
  const den = 10n ** BigInt(shift);
  return (num * 2n + den) / (den * 2n);
}

export function formatByteCount(bytes: number | bigint, locale?: string): string {
  const n = typeof bytes === 'bigint' ? bytes : BigInt(Math.trunc(bytes));
  if (n === 0n) return 'Zero KB';
  if (n === 1n) return '1 byte';
  if (n < 1000n) return `${n} bytes`;
  const sep = decimalSeparator(locale);
  for (let u = 0; u < UNITS.length; u++) {
    const d = DECIMALS[u] as number;
    const v = scaled(n, 3 * (u + 1), d);
    if (v >= 1000n * 10n ** BigInt(d) && u < UNITS.length - 1) continue;
    const whole = v / 10n ** BigInt(d);
    const frac = (v % 10n ** BigInt(d)).toString().padStart(d, '0').replace(/0+$/, '');
    return `${whole}${frac ? sep + frac : ''} ${UNITS[u]}`;
  }
  return `${n} bytes`;
}
