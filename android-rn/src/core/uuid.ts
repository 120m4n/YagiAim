// FS-12: `UUID().uuidString` = mayúsculas con guiones; `UUID(uuidString:)` acepta minúsculas.
const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

export const isUuidString = (s: string): boolean => UUID_RE.test(s);

/** Normaliza a mayúsculas (deduplicación entre plataformas); `undefined` si no es un UUID. */
export const parseUuid = (s: string): string | undefined => (UUID_RE.test(s) ? s.toUpperCase() : undefined);

export function randomUuid(random: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().toUpperCase();
  // ponytail: Math.random solo si el motor no trae crypto.randomUUID; son ids de registros, no secretos.
  const digits = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  digits[12] = '4';
  digits[16] = '89ab'.charAt(Math.floor(random() * 4));
  const s = digits.join('').toUpperCase();
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
