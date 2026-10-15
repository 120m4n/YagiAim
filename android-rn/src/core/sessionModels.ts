// Session/SessionModels.swift — modelos y reglas de negocio de las lecturas (puras y sin E/S).
import type { Location } from './aimInfo';
import { circularMean, median, signedDelta } from './geo';
import type { PingReport, PingResult } from './lineCodec';
import { roundHalfAwayFromZero } from './round';
import { randomUuid } from './uuid';
import type { Repeater } from './repeater';

/** Un `PING` con el rumbo del teléfono en el instante de transmitir y al recibir el resultado. */
export interface Sample {
  id: string;
  readingIndex: number; // 1-based
  tTx: Date;
  tRx: Date;
  headingTx: number; // rumbo verdadero del boom al escribir el comando
  headingRx: number; // ... al recibir el `P,` (≈ 1.4 s después)
  headingAccuracy: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  hAccuracy: number;
  targetBearing: number; // azimut calculado al repetidor
  delta: number; // targetBearing − headingTx, en (−180, 180]; positivo = girar a la derecha
  unstable: boolean; // el teléfono se movió más del umbral entre TX y RX
  invalid: boolean; // el pinger retrasó el TX (`#WARN duty_wait`): headingTx ya no corresponde
  result: PingResult;
}

/** Resumen de N muestras tomadas con la antena quieta. */
export interface Reading {
  id: string;
  index: number; // 1-based
  meanHeading?: number; // media circular de headingTx de las muestras usadas
  meanDelta?: number; // media circular de delta (correcta también cerca de ±180°)
  medSnrUp?: number;
  medSnrDn?: number;
  medRssiDn?: number;
  lossPct?: number; // 100·timeouts/(ok+timeouts), sobre todas las muestras; undefined sin datos
  stableCount: number; // muestras `ok`, no inestables y no inválidas
  needsRepeat: boolean; // stableCount < 3
}

export interface Session {
  id: string;
  repeater: Repeater; // instantánea al empezar
  started: Date;
  txpDbm?: number;
  fw?: string;
  proto: number;
  readings: Reading[];
  samples: Sample[];
}

export const unstableThreshold = 2.0; // grados entre headingTx y headingRx
export const minStableSamples = 3;
export const maxHeadingAccuracy = 15.0;

/** La brújula sirve si el sistema reporta una precisión no negativa y de a lo sumo 15°. */
export const headingIsValid = (accuracy: number): boolean => accuracy >= 0 && accuracy <= maxHeadingAccuracy;

export interface MakeSampleInput {
  id?: string;
  readingIndex: number;
  report: PingReport;
  headingTx: number;
  headingRx: number;
  headingAccuracy: number;
  location: Location;
  targetBearing: number;
  threshold?: number;
}

export function makeSample(i: MakeSampleInput): Sample {
  const moved = Math.abs(signedDelta(i.headingRx, i.headingTx));
  const s: Sample = {
    id: i.id ?? randomUuid(),
    readingIndex: i.readingIndex,
    tTx: i.report.tTx,
    tRx: i.report.tRx,
    headingTx: i.headingTx,
    headingRx: i.headingRx,
    headingAccuracy: i.headingAccuracy,
    latitude: i.location.latitude,
    longitude: i.location.longitude,
    hAccuracy: i.location.horizontalAccuracy,
    targetBearing: i.targetBearing,
    delta: signedDelta(i.targetBearing, i.headingTx),
    unstable: moved > (i.threshold ?? unstableThreshold),
    invalid: i.report.dutyWait,
    result: i.report.result,
  };
  if (i.location.verticalAccuracy >= 0) s.altitude = i.location.altitude;
  return s;
}

const defined = (xs: (number | undefined)[]): number[] => xs.filter((x): x is number => x !== undefined);

export function makeReading(index: number, samples: readonly Sample[], id: string = randomUuid()): Reading {
  const usable = samples.filter((s) => s.result.status === 'ok' && !s.unstable && !s.invalid);
  const timeouts = samples.filter((s) => s.result.status === 'timeout').length;
  const answered = samples.filter((s) => s.result.status === 'ok' || s.result.status === 'timeout').length;

  const r: Reading = { id, index, stableCount: usable.length, needsRepeat: usable.length < minStableSamples };
  const meanHeading = circularMean(usable.map((s) => s.headingTx));
  const meanDelta = circularMean(usable.map((s) => s.delta));
  const medSnrUp = median(defined(usable.map((s) => s.result.snrUp)));
  const medSnrDn = median(defined(usable.map((s) => s.result.snrDn)));
  const medRssiDn = median(defined(usable.map((s) => s.result.rssiDn)));
  if (meanHeading !== undefined) r.meanHeading = meanHeading;
  if (meanDelta !== undefined) r.meanDelta = signedDelta(meanDelta, 0);
  if (medSnrUp !== undefined) r.medSnrUp = medSnrUp;
  if (medSnrDn !== undefined) r.medSnrDn = medSnrDn;
  if (medRssiDn !== undefined) r.medRssiDn = medRssiDn;
  if (answered !== 0) r.lossPct = roundHalfAwayFromZero((100.0 * timeouts) / answered);
  return r;
}
