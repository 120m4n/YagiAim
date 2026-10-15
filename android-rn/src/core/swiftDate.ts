// FS-07: `Date` en `JSONEncoder` = segundos desde 2001-01-01 00:00:00 UTC (`timeIntervalSinceReferenceDate`).
const REFERENCE_DATE_MS = 978_307_200_000;

export const toSwiftDate = (d: Date): number => (d.getTime() - REFERENCE_DATE_MS) / 1000;

export const fromSwiftDate = (seconds: number): Date => new Date(Math.round(seconds * 1000) + REFERENCE_DATE_MS);
