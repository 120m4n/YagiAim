// FS-07 / C-9: `Date.formatted(date: .abbreviated, time: .shortened)` depende de la región del dispositivo. No se usa
// Intl.DateTimeFormat (otros separadores): los patrones de es_CO (región de referencia) y en_US salen de los dorados
// generados con `Locale(identifier:)` explícito. En otra región se usa es_CO.
import { wallClock, type TimeZoneSpec } from './timeZone';

const NNBSP = ' '; // CLDR 42+: espacio fino antes de a.m./p.m.

const MONTHS = {
  es_CO: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'],
  en_US: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

export type DateLocale = keyof typeof MONTHS;

export function resolveDateLocale(tag: string | undefined): DateLocale {
  return /^en[-_]US\b/i.test(tag ?? '') ? 'en_US' : 'es_CO';
}

export function formatAbbreviatedShortened(date: Date, locale: DateLocale, tz: TimeZoneSpec): string {
  const t = wallClock(date, tz);
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  const mm = (t.mi < 10 ? '0' : '') + t.mi;
  const pm = t.h >= 12;
  const mon = MONTHS[locale][t.mo - 1] as string;
  return locale === 'en_US'
    ? `${mon} ${t.d}, ${t.y} at ${h12}:${mm}${NNBSP}${pm ? 'PM' : 'AM'}`
    : `${t.d} de ${mon} de ${t.y}, ${h12}:${mm}${NNBSP}${pm ? 'p.m.' : 'a.m.'}`;
}
