// Contrato TS del módulo Kotlin `MeshAltitude` (modules/altitude) — PM-08.
import { requireNativeModule } from 'expo-modules-core';

export interface MslAltitude {
  /** Altitud sobre el nivel medio del mar (m). */
  msl: number;
  /** Precisión (m); -1 si no hay precisión vertical válida. */
  accuracy: number;
}

interface AltitudeNative {
  toMsl(latitude: number, longitude: number, altitude: number, verticalAccuracy: number): Promise<MslAltitude | null>;
}

let mod: AltitudeNative | undefined;

/** Convierte la altura sobre el elipsoide WGS84 de Android a MSL; `null` si la conversión falla. */
export const toMsl = (lat: number, lon: number, ellipsoidAlt: number, verticalAccuracy: number): Promise<MslAltitude | null> =>
  (mod ??= requireNativeModule<AltitudeNative>('MeshAltitude')).toMsl(lat, lon, ellipsoidAlt, verticalAccuracy);
