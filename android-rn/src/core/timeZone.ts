/** Zona horaria: `TimeZone.current` en el dispositivo; fija en los tests (p. ej. -05:00). */
export interface TimeZoneSpec {
  /** Minutos al este de UTC en ese instante. */
  offsetMinutes(at: Date): number;
}

export const fixedTimeZone = (minutes: number): TimeZoneSpec => ({ offsetMinutes: () => minutes });
export const localTimeZone: TimeZoneSpec = { offsetMinutes: (at) => -at.getTimezoneOffset() };

/** Hora de pared en esa zona; los campos son los getters UTC de la fecha desplazada. */
export function wallClock(d: Date, tz: TimeZoneSpec) {
  const off = tz.offsetMinutes(d);
  const w = new Date(d.getTime() + off * 60_000);
  return { off, y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes(), s: w.getUTCSeconds(), ms: w.getUTCMilliseconds() };
}
