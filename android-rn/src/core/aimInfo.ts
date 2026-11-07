// AimInfo.swift — datos derivados de apuntamiento.
import { formatFixed } from './formatC';
import { bearing, distance, elevation, signedDelta } from './geo';
import { repeaterCoordinate, type Repeater } from './repeater';

/** Equivalente a `CLLocation`. `altitude` es MSL (PM-08); `verticalAccuracy < 0` = no válida. */
export interface Location {
  latitude: number;
  longitude: number;
  altitude: number;
  horizontalAccuracy: number;
  verticalAccuracy: number;
  timestamp: Date;
}

export interface AimInfo {
  bearing: number;
  distance: number;
  elevation?: number;
  delta?: number;
}

export function aimInfo(me: Location | undefined, repeater: Repeater, heading: number | undefined): AimInfo | undefined {
  if (!me) return undefined;
  const target = repeaterCoordinate(repeater);
  const b = bearing(me, target);
  const d = distance(me, target);
  const info: AimInfo = { bearing: b, distance: d };
  if (repeater.altitude !== undefined && me.verticalAccuracy >= 0) info.elevation = elevation(d, me.altitude, repeater.altitude);
  if (heading !== undefined) info.delta = signedDelta(b, heading);
  return info;
}

/** `%.2f km` desde 1000 m, si no `%.0f m`. */
export const distanceText = (info: AimInfo): string =>
  info.distance >= 1000 ? `${formatFixed(info.distance / 1000, 2)} km` : `${formatFixed(info.distance, 0)} m`;
