// Adaptadores de Android para los puertos de las tiendas: ubicación fusionada (PM-04) con altitud MSL (PM-08), rumbo
// (PM-05) e inclinación (PM-07).
import * as ExpoLocation from 'expo-location';
import type { Location } from '../core/aimInfo';
import { HeadingFusion } from '../core/headingFusion';
import type { MagCal } from '../core/magCalibration';
import { decimalYear, magneticField } from '../core/wmm';
import { headingAvailable, startPitch, startSamples } from '../native/heading';
import { headingDebug } from '../state/headingDebug';
import { Keys, type Kv } from './kv';
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

const loadCalibration = (kv: Kv): MagCal | undefined => {
  const s = kv.getString(Keys.magCalibration);
  if (s === undefined) return undefined;
  try {
    const c = JSON.parse(s) as MagCal;
    return Array.isArray(c.offset) && Array.isArray(c.scale) && typeof c.rms === 'number' ? c : undefined;
  } catch {
    return undefined;
  }
};

/** Campo esperado en la ubicación, recalculado solo si te mueves > ~5 km o cambia el mes (el WMM varía muy despacio). */
function fieldCache() {
  let key = '';
  let value: ReturnType<typeof magneticField> | undefined;
  return (l: Location): ReturnType<typeof magneticField> => {
    const now = new Date();
    const k = `${Math.round(l.latitude * 10)}|${Math.round(l.longitude * 10)}|${now.getUTCFullYear()}-${now.getUTCMonth()}`;
    if (k !== key || !value) {
      key = k;
      value = magneticField(l.latitude, l.longitude, l.altitude / 1000, decimalYear(now));
    }
    return value;
  };
}

export function createAndroidLocationDriver(kv: Kv): LocationDriver {
  return {
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
    startHeading(onHeading, ctx) {
      let lastSaved = 0;
      const fusion = new HeadingFusion({
        ...(loadCalibration(kv) && { initialCal: loadCalibration(kv) as MagCal }),
        onCalibration: (cal) => {
          // Como mucho una escritura cada 10 s
          if (Date.now() - lastSaved < 10_000) return;
          lastSaved = Date.now();
          kv.setString(Keys.magCalibration, JSON.stringify(cal));
        },
      });
      const field = fieldCache();
      let debugAt = 0;
      return startSamples((s) => {
        const { location, live } = ctx.getLocation();
        const f = location ? field(location) : undefined;
        const out = fusion.process(s, { ...(f && { field: { declination: f.declination, inclination: f.inclination, total: f.total } }), liveFix: live && !!location });
        if (!out) return;
        onHeading({ azimuth: out.azimuth, usingMagnetic: out.usingMagnetic, accuracy: out.accuracy });
        if (Date.now() - debugAt > 500) {
          debugAt = Date.now();
          headingDebug.setState({ last: out.debug });
        }
      });
    },
  };
}

export const androidPitchSource: PitchSource = {
  get available() {
    return headingAvailable();
  },
  start: (onPitch) => startPitch(onPitch, 100),
};
