// ContentView.swift L18–26 y FR-015 — región visible persistida en `map.camera` como [lat, lon, latDelta, lonDelta].
export interface Region { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }

/** Región válida (`count == 4`, |lat| ≤ 90, |lon| ≤ 180, deltas > 0) o `undefined` = seguir al usuario. */
export function savedRegion(d: readonly number[] | undefined): Region | undefined {
  if (!d || d.length !== 4) return undefined;
  const [lat, lon, dLat, dLon] = d as [number, number, number, number];
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && dLat > 0 && dLon > 0)) return undefined;
  return { latitude: lat, longitude: lon, latitudeDelta: dLat, longitudeDelta: dLon };
}

export const regionToArray = (r: Region): number[] => [r.latitude, r.longitude, r.latitudeDelta, r.longitudeDelta];

/** [oeste, sur, este, norte] ↔ región. */
export const regionFromBounds = (b: readonly [number, number, number, number]): Region => ({
  latitude: (b[1] + b[3]) / 2, longitude: (b[0] + b[2]) / 2, latitudeDelta: b[3] - b[1], longitudeDelta: b[2] - b[0],
});

export const regionToBounds = (r: Region): [number, number, number, number] => [
  r.longitude - r.longitudeDelta / 2, r.latitude - r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2, r.latitude + r.latitudeDelta / 2,
];
