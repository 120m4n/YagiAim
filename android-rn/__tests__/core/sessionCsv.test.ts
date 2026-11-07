// Port 1:1 de MeshAzimuthTests/SessionCSVTests.swift (5 casos); zona fija −05:00.
import type { PingResult } from '../../src/core/lineCodec';
import { csvEscape, csvFileName, csvHeader, makeCsv, fixedTimeZone } from '../../src/core/sessionCsv';
import type { Sample, Session } from '../../src/core/sessionModels';

const utc5 = fixedTimeZone(-5 * 60);
const date = (iso: string) => new Date(iso);

function sample(idx: number, o: { ok?: boolean; unstable?: boolean; invalid?: boolean } = {}): Sample {
  const ok = o.ok ?? true;
  const result: PingResult = { seq: idx, tag: 'AABBCCDD', status: ok ? 'ok' : 'timeout', nResp: ok ? 1 : 0, ...(ok ? { rttMs: 300, snrUp: 9.25, snrDn: -0.5, rssiDn: -108 } : {}) };
  return {
    id: `S${idx}`, readingIndex: idx > 2 ? 2 : 1, tTx: date('2026-10-15T07:12:03.215-05:00'), tRx: date('2026-10-15T07:12:04.600-05:00'),
    headingTx: 61.04, headingRx: 61.5, headingAccuracy: 5, latitude: 3.4516, longitude: -76.532, altitude: 1012.34, hAccuracy: 4.8,
    targetBearing: 62.75, delta: 1.7, unstable: o.unstable ?? false, invalid: o.invalid ?? false, result,
  };
}

const session = (samples: Sample[], name = 'Cerro Pico'): Session => ({
  id: 'SESSION', repeater: { id: 'R1', name, latitude: 3.5, longitude: -76.6, hashPrefix: '4F' }, started: date('2026-10-15T07:12:03.215-05:00'),
  txpDbm: 22, fw: '0.1.0', proto: 1, readings: [], samples,
});

/** Divide una línea CSV respetando comillas (solo para el test). */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    if (c === '"') {
      if (inQuotes && chars[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = (csv: string) => csv.split('\r\n');

test('headerIsExactlyTheContract', () => {
  const expected = 'session_id,repeater_name,repeater_hash,repeater_lat,repeater_lon,reading_idx,sample_idx,t_tx_iso,t_rx_iso,lat,lon,alt_m,h_acc_m,target_bearing_deg,heading_tx_deg,heading_rx_deg,heading_acc_deg,delta_deg,unstable,invalid,seq,tag,status,rtt_ms,snr_up_db,snr_dn_db,rssi_dn_dbm,n_resp,txp_dbm,fw,proto';
  expect(csvHeader).toBe(expected);
  expect(makeCsv(session([]), utc5)).toBe(`${expected}\r\n`);
  expect(csvHeader.split(',').length).toBe(31);
});

test('oneRowPerSampleWithTheRightFormats', () => {
  const csv = makeCsv(session([sample(1), sample(2, { unstable: true }), sample(3, { invalid: true })]), utc5);
  const ls = lines(csv).filter((l) => l !== '');
  expect(ls.length).toBe(4); // cabecera + 3 muestras
  for (const l of ls) expect(fields(l).length).toBe(31);

  const f = fields(ls[1] as string);
  expect(f[2]).toBe('4F');
  expect(f[5]).toBe('1'); expect(f[6]).toBe('1'); // reading_idx, sample_idx (1-based)
  expect(f[7]).toBe('2026-10-15T07:12:03.215-05:00'); // ms y offset
  expect(f[8]).toBe('2026-10-15T07:12:04.600-05:00');
  expect(f[11]).toBe('1012.3'); // alt, 1 decimal
  expect(f[14]).toBe('61.0'); // *_deg con 1 decimal
  expect(f[17]).toBe('1.7');
  expect(f[18]).toBe('0'); expect(f[19]).toBe('0'); // unstable, invalid
  expect(f[22]).toBe('ok');
  expect(f[24]).toBe('+9.25'); expect(f[25]).toBe('-0.50'); expect(f[26]).toBe('-108.0'); // igual que la línea P,
  expect(f[28]).toBe('22'); expect(f[29]).toBe('0.1.0'); expect(f[30]).toBe('1');

  expect(fields(ls[2] as string)[18]).toBe('1'); // unstable
  expect(fields(ls[3] as string)[19]).toBe('1'); // invalid
  expect(fields(ls[3] as string)[5]).toBe('2'); expect(fields(ls[3] as string)[6]).toBe('1'); // la 3.ª muestra abre la lectura 2
});

test('timeoutRowsLeaveMeasurementsEmpty', () => {
  const csv = makeCsv(session([sample(1, { ok: false })]), utc5);
  const f = fields(lines(csv)[1] as string);
  expect(f[22]).toBe('timeout');
  expect([f[23], f[24], f[25], f[26]]).toEqual(['', '', '', '']); // rtt, snr_up, snr_dn, rssi
  expect(f[27]).toBe('0'); // n_resp
});

test('rfc4180Escaping', () => {
  expect(csvEscape('plano')).toBe('plano');
  expect(csvEscape('Cerro, Cali')).toBe('"Cerro, Cali"');
  expect(csvEscape('El "Pico"')).toBe('"El ""Pico"""');
  expect(csvEscape('a\nb')).toBe('"a\nb"');

  const csv = makeCsv(session([sample(1)], 'Cerro "El Pico", Cali'), utc5);
  const f = fields(lines(csv)[1] as string);
  expect(f.length).toBe(31); // la coma y las comillas no desplazan columnas
  expect(f[1]).toBe('Cerro "El Pico", Cali');
});

test('fileNameIsSafeAndTimestamped', () => {
  expect(csvFileName(session([], 'Cerro El Pico/Cali ñ'), utc5)).toBe('meshazimuth_Cerro_El_Pico_Cali___20261015-071203.csv');
});
