// MeshAzimuthApp.swift — una instancia de cada servicio para toda la app, inyectada por contexto. La factoría de
// transporte elige `SimulatedPinger` si `pinger.simulated` está activo AL CONECTAR, o BLE con el dispositivo elegido o el último.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { BleManager } from 'react-native-ble-plx';
import { BleLineTransport, type BleBackend } from '../link/bleLineTransport';
import { PingerLink } from '../link/pingerLink';
import { PingerScanner } from '../link/pingerScanner';
import { SimInputs, SimulatedPinger } from '../link/simulatedPinger';
import { nativeHaptics } from '../native/haptics';
import { androidLocationDriver, androidPitchSource } from '../platform/androidDrivers';
import { documentFiles } from '../platform/files';
import { Haptics } from '../platform/haptics';
import { Keys, Kv } from '../platform/kv';
import { mmkvBackend } from '../platform/kvMmkv';
import { netInfoSource } from '../platform/network';
import { ensureBluetoothPermissions } from '../platform/permissions';
import { SessionRecorder } from '../session/sessionRecorder';
import { SessionStore } from '../session/sessionStore';
import { LocationStore } from './locationStore';
import { MotionStore } from './motionStore';
import { NetworkStore } from './networkStore';
import { RepeaterStore, type RepeaterState } from './repeaterStore';

export interface Services {
  kv: Kv;
  location: LocationStore;
  repeaters: RepeaterStore;
  motion: MotionStore;
  network: NetworkStore;
  link: PingerLink;
  recorder: SessionRecorder;
  sessions: SessionStore;
  haptics: Haptics;
  simInputs: SimInputs;
  makeScanner: () => PingerScanner;
}

export function createServices(): Services {
  const kv = new Kv(mmkvBackend());
  const simInputs = new SimInputs();
  const manager = new BleManager() as unknown as BleBackend;
  const bleTransport = (deviceID: string | undefined) =>
    new BleLineTransport({ manager, kv, ensurePermissions: ensureBluetoothPermissions }, deviceID);
  const sessions = new SessionStore(documentFiles);
  return {
    kv,
    location: new LocationStore(androidLocationDriver, kv),
    repeaters: new RepeaterStore(kv),
    motion: new MotionStore(androidPitchSource),
    network: new NetworkStore(netInfoSource),
    link: new PingerLink((device) =>
      kv.getBool(Keys.pingerSimulated, false)
        ? new SimulatedPinger({}, () => simInputs.heading, () => simInputs.target)
        : bleTransport(device?.id ?? BleLineTransport.lastDeviceID(kv)), simInputs),
    recorder: new SessionRecorder(sessions),
    sessions,
    haptics: new Haptics(nativeHaptics()),
    simInputs,
    makeScanner: () => new PingerScanner(() => bleTransport(undefined)),
  };
}

const Ctx = createContext<Services | undefined>(undefined);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <Ctx.Provider value={services}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('Falta ServicesProvider');
  return s;
}

// Selectores sobre las tiendas (equivalen a leer propiedades de un @Observable).
export const useLocation = <T,>(sel: (s: LocationStore['state']) => T): T => useStore(useServices().location.store, sel);
export const useRepeaters = <T,>(sel: (s: RepeaterState) => T): T => useStore(useServices().repeaters.store, sel);
export const useMotionPitch = (): number | undefined => useStore(useServices().motion.store, (s) => s.pitch);
export const useOnline = (): boolean => useStore(useServices().network.store, (s) => s.isOnline);
export const useLink = <T,>(sel: (s: ReturnType<PingerLink['store']['getState']>) => T): T => useStore(useServices().link.store, sel);
export const useRecorder = <T,>(sel: (s: ReturnType<SessionRecorder['store']['getState']>) => T): T => useStore(useServices().recorder.store, sel);

/** Instancia estable por servicio (útil para el escáner del selector). */
export const useStable = <T,>(make: () => T): T => useMemo(make, []);
