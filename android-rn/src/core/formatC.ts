// FS-01: `String(format:)` / printf. `toFixed` redondea distinto (0.125 → "0.13") y pierde el signo de -0.0.

const F64 = new DataView(new ArrayBuffer(8));

/** Descompone un double finito y no negativo en `mant · 2^exp` exactos. */
function decompose(abs: number): { mant: bigint; exp: number } {
  F64.setFloat64(0, abs);
  const hi = F64.getUint32(0);
  const lo = F64.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  return biased === 0 ? { mant: frac, exp: -1074 } : { mant: frac | (1n << 52n), exp: biased - 1075 };
}

/** Texto decimal exacto de `abs` con `decimals` decimales, redondeando el valor binario exacto con empate a par (printf). */
function fixedDigits(abs: number, decimals: number): string {
  const { mant, exp } = decompose(abs);
  const scale = 10n ** BigInt(decimals);
  let num = mant * scale;
  let den = 1n;
  if (exp >= 0) num <<= BigInt(exp);
  else den <<= BigInt(-exp);
  let q = num / den;
  const twice = (num % den) * 2n;
  if (twice > den || (twice === den && (q & 1n) === 1n)) q += 1n;
  let s = q.toString();
  if (decimals === 0) return s;
  s = s.padStart(decimals + 1, '0');
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

/** `%.<decimals>f`, con `%+.<decimals>f` si `plus`. */
export function formatFixed(value: number, decimals: number, plus = false): string {
  if (Number.isNaN(value)) return plus ? '+nan' : 'nan';
  const negative = value < 0 || Object.is(value, -0);
  const sign = negative ? '-' : plus ? '+' : '';
  if (!Number.isFinite(value)) return `${sign}inf`;
  return sign + fixedDigits(Math.abs(value), decimals);
}

/** `%0<width>X` de un UInt32. */
export function formatHex(value: number, width = 8): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

const SPEC = /^%(\+?)(0?)(\d*)(?:\.(\d+))?([fXd])$/;

/** Especificadores que usa la app: `%.Nf`, `%+.Nf`, `%08X`, `%d`. */
export function formatC(spec: string, value: number): string {
  const m = SPEC.exec(spec);
  if (!m) throw new Error(`formatC: especificador no soportado: ${spec}`);
  const [, plus, zero, width, prec, conv] = m as unknown as [string, string, string, string, string | undefined, string];
  let body: string;
  if (conv === 'f') body = formatFixed(value, prec === undefined ? 6 : Math.trunc(Number(prec)), plus === '+');
  else if (conv === 'X') body = formatHex(value, 0);
  else body = (plus === '+' && value >= 0 ? '+' : '') + Math.trunc(value).toString();
  const w = width ? Math.trunc(Number(width)) : 0;
  if (body.length >= w) return body;
  if (zero === '0') {
    const signLen = /^[+-]/.test(body) ? 1 : 0;
    return body.slice(0, signLen) + '0'.repeat(w - body.length) + body.slice(signLen);
  }
  return body.padStart(w, ' ');
}
