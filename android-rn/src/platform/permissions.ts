// PM-11 — permisos. Ubicación: primer `start()`. Bluetooth: primer escaneo o conexión
// (BLUETOOTH_SCAN + BLUETOOTH_CONNECT en API 31+, ACCESS_FINE_LOCATION en API ≤ 30). Sin pantallas de justificación.
import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';

export type Authorization = 'notDetermined' | 'denied' | 'restricted' | 'authorizedWhenInUse' | 'authorizedAlways';

const fromResponse = (r: Location.LocationPermissionResponse): Authorization =>
  r.granted ? 'authorizedWhenInUse' : r.status === Location.PermissionStatus.UNDETERMINED ? 'notDetermined' : 'denied';

export const getLocationAuthorization = async (): Promise<Authorization> => fromResponse(await Location.getForegroundPermissionsAsync());
export const requestLocationAuthorization = async (): Promise<Authorization> => fromResponse(await Location.requestForegroundPermissionsAsync());

/** Pide los permisos de Bluetooth que hagan falta según la API. `true` si quedan concedidos. */
export async function ensureBluetoothPermissions(): Promise<boolean> {
  const P = PermissionsAndroid.PERMISSIONS;
  const needed = typeof Platform.Version === 'number' && Platform.Version >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
  const r = await PermissionsAndroid.requestMultiple(needed);
  return needed.every((p) => r[p] === PermissionsAndroid.RESULTS.GRANTED);
}
