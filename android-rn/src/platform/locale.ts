// C-9 / FS-07 / FS-11 — región del dispositivo. Hermes expone la región en `Intl.DateTimeFormat().resolvedOptions().locale`.
export function resolveLocaleTag(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'es-CO';
  }
}
