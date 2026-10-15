// PM-11 — "Abrir Ajustes": detalles de la app para permisos; ajustes de Bluetooth para `bluetoothOff`.
import { Linking } from 'react-native';
import type { LinkError } from '../link/lineTransport';

export const openAppSettings = (): Promise<void> => Linking.openSettings();

export const openBluetoothSettings = (): Promise<void> => Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');

/** `unauthorized` → ajustes de la app; `bluetoothOff` → ajustes de Bluetooth. */
export const openSettingsFor = (e: LinkError): Promise<void> =>
  e.kind === 'bluetoothOff' ? openBluetoothSettings() : openAppSettings();
