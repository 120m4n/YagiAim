// Port 1:1 de MeshAzimuthTests/SessionRulesTests.swift (13 casos).
import type { Location } from '../../src/core/aimInfo';
import { circularMean, normalize, signedDelta } from '../../src/core/geo';
import type { PingReport, PingResult, PingStatus } from '../../src/core/lineCodec';
import { headingIsValid, makeReading, makeSample } from '../../src/core/sessionModels';
import { near } from '../helpers/near';

const here: Location = { latitude: 3.45, longitude: -76.53, altitude: 1000, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: new Date() };

function report(status: PingStatus = 'ok', up: number | undefined = -6.25, dn: number | undefined = -4.5, rssi: number | undefined = -108, duty = false): PingReport {
  const ok = status === 'ok';
  const result: PingResult = { seq: 1, tag: 'AABBCCDD', status, nResp: ok ? 1 : 0, ...(ok ? { rttMs: 300, snrUp: up, snrDn: dn, rssiDn: rssi } : {}) };
  return { result, tTx: new Date(), tRx: new Date(), dutyWait: duty };
}

function sample(rep: PingReport, o: { hTx?: number; moved?: number; target?: number } = {}) {
  const hTx = o.hTx ?? 100;
  return makeSample({ readingIndex: 1, report: rep, headingTx: hTx, headingRx: normalize(hTx + (o.moved ?? 0)), headingAccuracy: 5, location: here, targetBearing: o.target ?? 100 });
}

test('unstableThresholdIsExclusive', () => {
  expect(sample(report(), { moved: 2.0 }).unstable).toBe(false); // exactamente 2° no es inestable
  expect(sample(report(), { moved: 2.1 }).unstable).toBe(true);
  expect(sample(report(), { moved: -3 }).unstable).toBe(true); // vale en ambos sentidos
});

test('unstableAcrossNorth', () => {
  expect(sample(report(), { hTx: 359, moved: 2 }).unstable).toBe(false); // 359° → 1°: se movió 2°, no 358°
  expect(sample(report(), { hTx: 359, moved: 4 }).unstable).toBe(true);
});

test('dutyWaitMakesTheSampleInvalidAndExcludedFromTheMedian', () => {
  const good = [0, 1, 2, 3].map(() => sample(report('ok', -6.0)));
  const delayed = sample(report('ok', 20.0, undefined, undefined, true)); // ok, pero el TX se retrasó
  expect(delayed.invalid).toBe(true);
  expect(delayed.unstable).toBe(false);
  const r = makeReading(1, [...good, delayed]);
  expect(r.stableCount).toBe(4);
  expect(r.medSnrUp).toBe(-6.0); // el +20 no entra
});

test('fiveStableSamplesGiveTheMedians', () => {
  const ups = [-6.25, -6.0, -5.75, -6.5, -6.25];
  const r = makeReading(1, ups.map((u) => sample(report('ok', u, u + 2, u * 10))));
  expect(r.medSnrUp).toBe(-6.25);
  expect(r.medSnrDn).toBe(-4.25);
  expect(r.medRssiDn).toBe(-62.5);
  expect(r.stableCount).toBe(5);
  expect(r.needsRepeat).toBe(false);
  expect(r.lossPct).toBe(0);
});

test('evenCountMedianAveragesTheMiddlePair', () => {
  const r = makeReading(1, [-6.25, -4.5, -3.0, -8.0].map((u) => sample(report('ok', u))));
  near(r.medSnrUp, (-6.25 + -4.5) / 2, 1e-12); // ordenado: -8, -6.25, -4.5, -3
});

test('unstableSamplesAreExcludedFromTheMedians', () => {
  const stable = [0, 1, 2].map(() => sample(report('ok', -6.0)));
  const moving = [0, 1].map(() => sample(report('ok', 15.0), { moved: 3 }));
  const r = makeReading(1, [...stable, ...moving]);
  expect(r.stableCount).toBe(3);
  expect(r.medSnrUp).toBe(-6.0);
  expect(r.needsRepeat).toBe(false);
});

test('fewerThanThreeStableSamplesNeedsRepeat', () => {
  const r = makeReading(1, [sample(report()), sample(report()), ...[0, 1, 2].map(() => sample(report(), { moved: 5 }))]);
  expect(r.stableCount).toBe(2);
  expect(r.needsRepeat).toBe(true);
});

test('noUsableSamplesLeavesEverythingEmpty', () => {
  const r = makeReading(1, [0, 1, 2].map(() => sample(report('timeout'))));
  expect(r.medSnrUp).toBeUndefined();
  expect(r.meanHeading).toBeUndefined();
  expect(r.meanDelta).toBeUndefined();
  expect(r.stableCount).toBe(0);
  expect(r.needsRepeat).toBe(true);
  expect(r.lossPct).toBe(100);
});

test('lossCountsTimeoutsOverAnsweredPingsAndIgnoresBusy', () => {
  const r1 = makeReading(1, [sample(report()), sample(report()), sample(report()), sample(report()), sample(report('timeout'))]);
  expect(r1.lossPct).toBe(20);
  const r2 = makeReading(1, [sample(report()), sample(report()), sample(report('timeout')), sample(report('busy'))]);
  expect(r2.lossPct).toBe(33); // 1/3: busy no cuenta
  const r3 = makeReading(1, [sample(report('busy')), sample(report('txerr'))]);
  expect(r3.lossPct).toBeUndefined();
});

test('deltaIsSignedLikeTheUI', () => {
  near(sample(report(), { hTx: 350, target: 10 }).delta, 20, 1e-9); // girar a la derecha
  near(sample(report(), { hTx: 10, target: 350 }).delta, -20, 1e-9);
});

test('meanHeadingIsCircular', () => {
  const r = makeReading(1, [358, 2, 0].map((h) => sample(report(), { hTx: h, target: h })));
  near(signedDelta(r.meanHeading as number, 0), 0, 1e-9); // no 120°
});

test('meanDeltaDoesNotCollapseNearOppositeDirection', () => {
  // Antena apuntando al revés: deltas +179 y -179. La media aritmética daría 0 (¡alineado!); debe dar ±180.
  const a = sample(report(), { hTx: 100, target: 279 });
  near(a.delta, 179, 1e-9);
  const c = sample(report(), { hTx: 100, target: 100 - 179 });
  near(c.delta, -179, 1e-9);
  const r = makeReading(1, [a, c]);
  expect(Math.abs(r.meanDelta as number)).toBeGreaterThan(179);
  expect(circularMean([a.delta, c.delta])).toBeDefined();
});

test('headingAccuracyRule', () => {
  expect(headingIsValid(-1)).toBe(false);
  expect(headingIsValid(0)).toBe(true);
  expect(headingIsValid(15)).toBe(true);
  expect(headingIsValid(15.1)).toBe(false);
  expect(headingIsValid(20)).toBe(false);
});
