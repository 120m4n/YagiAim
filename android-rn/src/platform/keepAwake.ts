// AimView.swift L96–97 — `isIdleTimerDisabled`: la pantalla no se apaga mientras el apuntamiento está abierto.
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const TAG = 'aim';

export const keepScreenOn = (): Promise<void> => activateKeepAwakeAsync(TAG);
export const allowScreenOff = (): Promise<void> => deactivateKeepAwake(TAG);
