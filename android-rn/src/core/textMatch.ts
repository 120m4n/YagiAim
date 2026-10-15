// FS-11: `localizedCaseInsensitiveContains` / `localizedCaseInsensitiveCompare`.
// Contains: sin distinguir mayúsculas (pliegue completo: "straße" ~ "STRASSE"), SÍ distingue acentos, equivalencia
// canónica (NFC), y una aguja vacía nunca coincide (medido en los dorados).
export function localizedCaseInsensitiveContains(hay: string, needle: string, locale?: string): boolean {
  if (needle === '') return false;
  const fold = (s: string) => s.normalize('NFC').toLocaleUpperCase(locale);
  return fold(hay).includes(fold(needle));
}

/** -1 / 0 / 1 como `ComparisonResult.rawValue`. */
export function localizedCaseInsensitiveCompare(a: string, b: string, locale?: string): -1 | 0 | 1 {
  const r = new Intl.Collator(locale, { sensitivity: 'accent' }).compare(a, b);
  return r < 0 ? -1 : r > 0 ? 1 : 0;
}
