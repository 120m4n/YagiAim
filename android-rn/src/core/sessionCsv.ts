// Session/SessionCSV.swift — exportación CSV (specs/003.../contracts/session-csv.md): RFC 4180, UTF-8, separador `,`,
// punto decimal, una fila por muestra, `\r\n` también tras la última fila.
import { formatFixed } from './formatC';
import { splitGraphemes } from './graphemes';
import type { Session } from './sessionModels';
import { fixedTimeZone, localTimeZone, wallClock, type TimeZoneSpec } from './timeZone';

export const csvHeader =
  'session_id,repeater_name,repeater_hash,repeater_lat,repeater_lon,reading_idx,sample_idx,t_tx_iso,t_rx_iso,lat,lon,alt_m,h_acc_m,target_bearing_deg,heading_tx_deg,heading_rx_deg,heading_acc_deg,delta_deg,unstable,invalid,seq,tag,status,rtt_ms,snr_up_db,snr_dn_db,rssi_dn_dbm,n_resp,txp_dbm,fw,proto';

export { fixedTimeZone, localTimeZone, type TimeZoneSpec };

const p2 = (n: number) => (n < 10 ? '0' : '') + n;
const p3 = (n: number) => (n < 10 ? '00' : n < 100 ? '0' : '') + n;

const parts = wallClock;

/** `ISO8601DateFormatter` con `[.withInternetDateTime, .withFractionalSeconds]`: `2026-10-15T07:12:03.215-05:00`, `Z` en UTC. */
export function isoString(d: Date, tz: TimeZoneSpec): string {
  const t = parts(d, tz);
  const zone = t.off === 0 ? 'Z' : `${t.off < 0 ? '-' : '+'}${p2(Math.trunc(Math.abs(t.off) / 60))}:${p2(Math.abs(t.off) % 60)}`;
  return `${t.y}-${p2(t.mo)}-${p2(t.d)}T${p2(t.h)}:${p2(t.mi)}:${p2(t.s)}.${p3(t.ms)}${zone}`;
}

/** RFC 4180: un campo con coma, comilla o salto de línea va entre comillas y las comillas se duplican.
 *  Como en Swift se compara por Character: un "\r\n" es UN carácter y no cuenta como "\n" ni como "\r". */
export function csvEscape(field: string): string {
  const needs = splitGraphemes(field).some((g) => g === ',' || g === '"' || g === '\n' || g === '\r');
  return needs ? `"${field.split('"').join('""')}"` : field;
}

const opt = (v: number | undefined, f: (n: number) => string): string => (v === undefined ? '' : f(v));

export function makeCsv(s: Session, tz: TimeZoneSpec = localTimeZone): string {
  const rows = [csvHeader];
  const position = new Map<number, number>(); // sample_idx: orden dentro de su lectura
  for (const sample of s.samples) {
    const n = (position.get(sample.readingIndex) ?? 0) + 1;
    position.set(sample.readingIndex, n);
    const r = sample.result;
    const fields = [
      s.id, s.repeater.name, s.repeater.hashPrefix ?? '',
      formatFixed(s.repeater.latitude, 6), formatFixed(s.repeater.longitude, 6),
      String(sample.readingIndex), String(n),
      isoString(sample.tTx, tz), isoString(sample.tRx, tz),
      formatFixed(sample.latitude, 6), formatFixed(sample.longitude, 6), opt(sample.altitude, (a) => formatFixed(a, 1)), formatFixed(sample.hAccuracy, 1),
      formatFixed(sample.targetBearing, 1), formatFixed(sample.headingTx, 1), formatFixed(sample.headingRx, 1), formatFixed(sample.headingAccuracy, 1), formatFixed(sample.delta, 1),
      sample.unstable ? '1' : '0', sample.invalid ? '1' : '0',
      String(r.seq), r.tag, r.status,
      opt(r.rttMs, String),
      opt(r.snrUp, (v) => formatFixed(v, 2, true)), opt(r.snrDn, (v) => formatFixed(v, 2, true)),
      opt(r.rssiDn, (v) => formatFixed(v, 1, true)),
      String(r.nResp), opt(s.txpDbm, String), s.fw ?? '', String(s.proto),
    ];
    rows.push(fields.map(csvEscape).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

/** `meshazimuth_<repetidor>_<yyyyMMdd-HHmmss>.csv`; solo [A-Za-z0-9-] por grafema, el resto `_` (FS-08). */
export function csvFileName(s: Session, tz: TimeZoneSpec = localTimeZone): string {
  const t = parts(s.started, tz);
  const stamp = `${t.y}${p2(t.mo)}${p2(t.d)}-${p2(t.h)}${p2(t.mi)}${p2(t.s)}`;
  const safe = splitGraphemes(s.repeater.name).map((g) => (/^[A-Za-z0-9-]$/.test(g) ? g : '_')).join('');
  return `meshazimuth_${safe}_${stamp}.csv`;
}
