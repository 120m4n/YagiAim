// Adaptadores de Android para los puertos de las tiendas: ubicación fusionada (PM-04) con altitud MSL (PM-08), rumbo
// (PM-05) e inclinación (PM-07).
import * as ExpoLocation from 'expo-location';
import type { Location } from '../core/aimInfo';
import { headingAvailable, startHeading, startPitch } from '../native/heading';
import { toMsl } from '../native/altitude';
import type { LocationDriver } from '../state/locationStore';
import type { PitchSource } from '../state/motionStore';
import { getLocationAuthorization, requestLocationAuthorization } from './permissions';

/** FusedLocationProviderClient con PRIORITY_HIGH_ACCURACY, intervalo de 1 s y `minUpdateDistanceMeters = 2` (PM-04). */
const OPTIONS: ExpoLocation.LocationOptions = { accuracy: ExpoLocation.Accuracy.Highest, timeInterval: 1000, distanceInterval: 2 };

async function toLocation(l: ExpoLocation.LocationObject): Promise<Location | undefined> {
  const c = l.coords;
  // Sin precisión (Android puede no tenerla) → se descarta el fix, equivale a `horizontalAccuracy < 0` (PM-04).
  if (c.accuracy === null || !(c.accuracy >= 0)) return undefined;
  const vertical = c.altitudeAccuracy ?? -1;
  let altitude = c.altitude;
  let verticalAccuracy = -1;
  if (c.altitude !== null) {
    const msl = await toMsl(c.latitude, c.longitude, c.altitude, vertical).catch(() => null);
    // PM-08: sin altitud MSL o sin precisión → verticalAccuracy = -1.
    if (msl) {
      altitude = msl.msl;
      verticalAccuracy = msl.accuracy >= 0 ? msl.accuracy : vertical;
    }
  }
  return {
    latitude: c.latitude, longitude: c.longitude, altitude: altitude ?? 0,
    horizontalAccuracy: c.accuracy, verticalAccuracy, timestamp: new Date(l.timestamp),
  };
}

export const androidLocationDriver: LocationDriver = {
  getAuthorization: getLocationAuthorization,
  requestAuthorization: requestLocationAuthorization,
  async startLocation(onLocation) {
    // La conversión a MSL es asíncrona: se encadena para conservar el orden de los fixes.
    let chain: Promise<unknown> = Promise.resolve();
    const sub = await ExpoLocation.watchPositionAsync(OPTIONS, (l) => {
      chain = chain.then(async () => {
        const loc = await toLocation(l);
        if (loc) onLocation(loc);
      });
    });
    return () => sub.remove();
  },
  get headingAvailable() {
    return headingAvailable();
  },
  startHeading: (onHeading) => startHeading(onHeading),
};

export const androidPitchSource: PitchSource = {
  get available() {
    return headingAvailable();
  },
  start: (onPitch) => startPitch(onPitch, 100),
};
