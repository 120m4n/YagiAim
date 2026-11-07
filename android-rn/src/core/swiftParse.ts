// FS-02 y FS-03: `Double(String)` e `Int(String)` de Swift. `Number("")` da 0, `Number(" 5")` da 5 y
// `parseFloat("5abc")` da 5: ninguna sirve. Gramática de strtod sin espacios.

const DEC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const HEX = /^([+-]?)0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?\d+))?$/;
const SPECIAL = /^([+-]?)(inf|infinity|nan(?:\([0-9a-zA-Z_]*\))?)$/i;

/** `Double(text)`: `undefined` donde Swift devuelve nil. Acepta `inf`/`nan`; quien exija finitos lo comprueba. */
export function parseSwiftDouble(s: string): number | undefined {
  const sp = SPECIAL.exec(s);
  if (sp) {
    if (sp[2]?.toLowerCase().startsWith('nan')) return Number.NaN;
    return sp[1] === '-' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  }
  if (DEC.test(s)) return Number(s);
  const h = HEX.exec(s);
  if (h) {
    const intPart = h[2] ?? '';
    const fracPart = h[3] ?? '';
    if (intPart === '' && fracPart === '') return undefined;
    const mant = BigInt(`0x${intPart}${fracPart}` || '0x0');
    const exp = (h[4] === undefined ? 0 : Number(h[4])) - 4 * fracPart.length;
    // 2^exp en dos pasos para no desbordar el exponente intermedio.
    const half = Math.trunc(exp / 2);
    const v = Number(mant) * 2 ** half * 2 ** (exp - half);
    return h[1] === '-' ? -v : v;
  }
  return undefined;
}

const INT_RE = /^[+-]?\d+$/;
const INT64_MAX = (1n << 63n) - 1n;
const INT64_MIN = -(1n << 63n);
const UINT64_MAX = (1n << 64n) - 1n;

/** `Int(text)`: signo opcional, dígitos ASCII, sin espacios; el desbordamiento de 64 bits da nil. */
export function parseSwiftInt(s: string): number | undefined {
  if (!INT_RE.test(s)) return undefined;
  const v = BigInt(s);
  if (v > INT64_MAX || v < INT64_MIN) return undefined;
  return Number(v);
}

/** `UInt(text)` tras comprobar solo dígitos ASCII (el `uint` del codec). Devuelve BigInt para comparar con UInt32.max sin perder bits. */
export function parseSwiftUInt(s: string): bigint | undefined {
  if (!/^\d+$/.test(s)) return undefined;
  const v = BigInt(s);
  return v > UINT64_MAX ? undefined : v;
}

/** BigInt → number (ya comprobados los límites del campo en el codec). */
export const bigintToNumber = (b: bigint): number => Number(b);
