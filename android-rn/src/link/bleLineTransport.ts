// Link/BLELineTransport.swift sobre react-native-ble-plx (PM-09, PM-11, PM-12) — Nordic UART Service del pinger
// (specs/003.../contracts/ble-nus-gatt.md).
//
// Se habla con un `BleBackend` (el subconjunto de `BleManager` que se usa) para poder probarlo con un mock (T092).
// Los valores de `State` de ble-plx son cadenas, así que no se importa nada de la biblioteca en tiempo de ejecución.
import type { BleError, Characteristic, Device, Subscription } from 'react-native-ble-plx';
import { LineAssembler } from '../core/lineAssembler';
import { utf8Encode } from '../core/utf8';
import { Keys, type Kv } from '../platform/kv';
import { AsyncStream } from './async';
import { base64ToBytes, bytesToBase64 } from './base64';
import {
  connecting, failed, idle, linkErrors, ready, scanning, type LineTransport, type LinkError, type LinkState, type PingerDevice,
} from './lineTransport';

export const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const RX_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // central → pinger (comandos)
export const TX_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // pinger → central (eventos)
export const NAME_PREFIX = 'YagiPinger-';
/** Segundos para conectar de punta a punta (SC-001: ≤ 5 s con el pinger a menos de 3 m). */
export const OPEN_TIMEOUT_MS = 10_000;
/** PM-12: Android arranca con MTU 23; se pide 247 (equivale a la negociación automática de iOS). */
export const REQUEST_MTU = 247;

type BtState = 'Unknown' | 'Resetting' | 'Unsupported' | 'Unauthorized' | 'PoweredOff' | 'PoweredOn';

/** Subconjunto de `BleManager` que usa el transporte. */
export interface BleBackend {
  onStateChange(listener: (s: BtState) => void, emitCurrentState?: boolean): Subscription;
  startDeviceScan(uuids: string[] | null, options: { allowDuplicates?: boolean } | null, listener: (e: BleError | null, d: Device | null) => void): Promise<void>;
  stopDeviceScan(): Promise<void>;
  connectToDevice(id: string, options?: { requestMTU?: number; timeout?: number }): Promise<Device>;
  cancelDeviceConnection(id: string): Promise<Device>;
  onDeviceDisconnected(id: string, listener: (e: BleError | null, d: Device | null) => void): Subscription;
  discoverAllServicesAndCharacteristicsForDevice(id: string): Promise<Device>;
  monitorCharacteristicForDevice(id: string, service: string, char: string, listener: (e: BleError | null, c: Characteristic | null) => void): Subscription;
  writeCharacteristicWithoutResponseForDevice(id: string, service: string, char: string, base64Value: string): Promise<Characteristic>;
}

export interface BleLineTransportDeps {
  manager: BleBackend;
  kv: Kv;
  /** Pide los permisos de Bluetooth si faltan (PM-11). `false` → `unauthorized`. */
  ensurePermissions: () => Promise<boolean>;
}

const uuidEq = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

export class BleLineTransport implements LineTransport {
  readonly lines = new AsyncStream<string>();
  readonly states = new AsyncStream<LinkState>();
  /** Pingers vistos durante el escaneo, ordenados por nombre. */
  readonly devices = new AsyncStream<PingerDevice[]>();

  private _state: LinkState = idle;
  private assembler = new LineAssembler();
  private targetID: string | undefined;
  private found = new Map<string, PingerDevice>();
  private peripheral: Device | undefined;
  private connectedId: string | undefined;
  private mtu = 23;
  private scanning = false;
  private wantsOpen = false;
  private btState: BtState = 'Unknown';
  private prepared: Promise<boolean> | undefined;
  private openCtl: { resolve: () => void; reject: (e: LinkError) => void } | undefined;
  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private subs: Subscription[] = [];
  private monitorSub: Subscription | undefined;
  private disconnectSub: Subscription | undefined;
  private writeChain: Promise<unknown> = Promise.resolve();
  private connecting = false;
  /** Equivale a `peripheral != nil` de Swift en el temporizador de apertura: ya se intentó conectar a un periférico. */
  private attempted = false;
  private closed = false;

  /** `deviceID`: periférico concreto (el último usado, por ejemplo). Sin él, conecta al primer `YagiPinger-*`. */
  constructor(private readonly deps: BleLineTransportDeps, deviceID: string | undefined = BleLineTransport.lastDeviceID(deps.kv)) {
    this.targetID = deviceID;
  }

  static lastDeviceID(kv: Kv): string | undefined {
    return kv.getString(Keys.pingerLastDevice);
  }

  get state(): LinkState {
    return this._state;
  }

  private setState(s: LinkState): void {
    this._state = s;
    this.states.push(s);
  }

  // MARK: - API

  /** Empieza a listar pingers cercanos (para el selector). */
  startScan(): void {
    this.scanning = true;
    if (!this.wantsOpen) this.setState(scanning);
    void this.prepare().then((ok) => {
      if (!ok || this.closed) return;
      this.scanIfPossible();
      this.reportBluetoothAvailability();
    });
  }

  stopScan(): void {
    this.scanning = false;
    if (!this.wantsOpen) void this.deps.manager.stopDeviceScan().catch(() => undefined);
  }

  select(id: string | undefined): void {
    this.targetID = id;
  }

  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.openCtl) return reject(linkErrors.connectionLost);
      this.openCtl = { resolve, reject };
      this.wantsOpen = true;
      this.setState(connecting);
      this.armOpenTimer();
      void this.prepare().then((ok) => {
        if (ok && !this.closed) this.beginConnectIfPossible();
      });
    });
  }

  close(): void {
    this.wantsOpen = false;
    this.closed = true;
    clearTimeout(this.openTimer);
    void this.deps.manager.stopDeviceScan().catch(() => undefined);
    if (this.connectedId) void this.deps.manager.cancelDeviceConnection(this.connectedId).catch(() => undefined);
    this.finishOpen(linkErrors.connectionLost);
    this.teardownLink();
    for (const s of this.subs) s.remove();
    this.subs = [];
    this.setState(idle);
    this.lines.finish();
    this.states.finish();
    this.devices.finish();
  }

  async send(line: string): Promise<void> {
    const id = this.connectedId;
    if (this._state.kind !== 'ready' || !id || !this.monitorSub) throw linkErrors.connectionLost;
    // Fragmenta según el MTU negociado; el pinger reensambla por '\n'.
    const size = Math.max(this.mtu - 3, 20);
    const bytes = utf8Encode(`${line}\n`);
    const run = this.writeChain.then(async () => {
      for (let start = 0; start < bytes.length; start += size) {
        await this.deps.manager.writeCharacteristicWithoutResponseForDevice(id, SERVICE_UUID, RX_UUID, bytesToBase64(bytes.subarray(start, start + size)));
      }
    });
    // La cadena sigue aunque una escritura falle, para no bloquear las siguientes.
    this.writeChain = run.catch(() => undefined);
    try {
      await run;
    } catch {
      throw linkErrors.writeFailed;
    }
  }

  // MARK: - Gestor

  /** Pide permisos y se suscribe al estado del adaptador, una sola vez. */
  private prepare(): Promise<boolean> {
    this.prepared ??= (async () => {
      if (!(await this.deps.ensurePermissions())) {
        this.btState = 'Unauthorized';
        if (this.wantsOpen) this.failOpen(linkErrors.unauthorized);
        else if (this.scanning) this.setState(failed(linkErrors.unauthorized));
        return false;
      }
      this.subs.push(this.deps.manager.onStateChange((s) => this.stateDidUpdate(s), true));
      return true;
    })();
    return this.prepared;
  }

  private armOpenTimer(): void {
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      if (!this.openCtl) return;
      this.failOpen(this.found.size === 0 && !this.attempted ? linkErrors.deviceNotFound : linkErrors.timeout);
    }, OPEN_TIMEOUT_MS);
  }

  /** Mientras solo se escanea (selector), el estado dice si Bluetooth está apagado o sin permiso. */
  private reportBluetoothAvailability(): void {
    if (!this.scanning || this.wantsOpen) return;
    switch (this.btState) {
      case 'PoweredOn': this.setState(scanning); break;
      case 'PoweredOff': case 'Unsupported': this.setState(failed(linkErrors.bluetoothOff)); break;
      case 'Unauthorized': this.setState(failed(linkErrors.unauthorized)); break;
      default: break;
    }
  }

  private scanIfPossible(): void {
    if (this.btState !== 'PoweredOn') return;
    // R-5 / PM-09: filtro por servicio NUS; el prefijo de nombre se aplica abajo, como en Swift (L227).
    void this.deps.manager.startDeviceScan([SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
      if (error || !device || this.closed) return;
      this.didDiscover(device);
    }).catch(() => undefined); // p. ej. límite de 5 escaneos cada 30 s: el selector muestra "No se encontró…" a los 10 s
  }

  private didDiscover(d: Device): void {
    const name = d.localName ?? d.name ?? '';
    if (!name.startsWith(NAME_PREFIX)) return;
    this.found.set(d.id, { id: d.id, name });
    this.devices.push([...this.found.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
    if (this.wantsOpen && !this.peripheral && !this.connecting && (this.targetID === undefined || this.targetID === d.id)) void this.connect(d.id);
  }

  private stateDidUpdate(s: BtState): void {
    this.btState = s;
    if (this.scanning) this.scanIfPossible();
    this.reportBluetoothAvailability();
    this.beginConnectIfPossible();
    if ((s === 'PoweredOff' || s === 'Unauthorized') && this._state.kind === 'ready') {
      this.setState(failed(s === 'PoweredOff' ? linkErrors.bluetoothOff : linkErrors.unauthorized));
    }
  }

  private beginConnectIfPossible(): void {
    if (!this.wantsOpen) return;
    switch (this.btState) {
      case 'PoweredOn':
        if (this.connecting) return;
        if (this.peripheral) void this.connect(this.peripheral.id); // reapertura tras una desconexión: mismo periférico
        else if (this.targetID !== undefined) void this.connect(this.targetID); // PM-09: conexión directa por dirección
        else this.scanIfPossible(); // el primer YagiPinger-* que aparezca
        break;
      case 'PoweredOff': this.failOpen(linkErrors.bluetoothOff); break;
      case 'Unauthorized': this.failOpen(linkErrors.unauthorized); break;
      case 'Unsupported': this.failOpen(linkErrors.bluetoothOff); break;
      default: break; // Unknown / Resetting: llegará stateDidUpdate
    }
  }

  private async connect(id: string): Promise<void> {
    this.connecting = true;
    this.attempted = true;
    void this.deps.manager.stopDeviceScan().catch(() => undefined);
    const m = this.deps.manager;
    try {
      const device = await m.connectToDevice(id, { requestMTU: REQUEST_MTU, timeout: OPEN_TIMEOUT_MS });
      if (!this.wantsOpen) return;
      this.peripheral = device;
      this.connectedId = id;
      this.disconnectSub?.remove();
      this.disconnectSub = m.onDeviceDisconnected(id, () => this.didDisconnect(id));
      const discovered = await m.discoverAllServicesAndCharacteristicsForDevice(id);
      if (!this.wantsOpen) return;
      this.mtu = discovered.mtu || device.mtu || 23;
      this.assembler = new LineAssembler();
      this.monitorSub?.remove();
      this.monitorSub = m.monitorCharacteristicForDevice(id, SERVICE_UUID, TX_UUID, (error, c) => this.didUpdateValue(error, c));
      // "Quedar notificando": se guarda el último usado y se declara listo (los siguientes comandos se encolan tras el CCCD).
      this.deps.kv.setString(Keys.pingerLastDevice, id);
      this.setState(ready);
      this.finishOpen();
    } catch {
      // didFailToConnect y fallos de servicios o características → .deviceNotFound (Swift L239, L253, L260)
      if (this.wantsOpen) this.failOpen(linkErrors.deviceNotFound);
    } finally {
      this.connecting = false;
    }
  }

  private didUpdateValue(error: BleError | null, c: Characteristic | null): void {
    if (error) {
      // Error al activar las notificaciones durante la apertura → `writeFailed` (L266); luego lo cubre didDisconnect.
      if (this.openCtl && this._state.kind !== 'ready') this.failOpen(linkErrors.writeFailed);
      return;
    }
    if (!c?.value || (c.uuid && !uuidEq(c.uuid, TX_UUID))) return;
    for (const line of this.assembler.feed(base64ToBytes(c.value))) this.lines.push(line);
  }

  private didDisconnect(id: string): void {
    if (id !== this.connectedId) return;
    this.teardownLink(true);
    if (this.openCtl) this.failOpen(linkErrors.connectionLost);
    else if (this._state.kind === 'ready') this.setState(failed(linkErrors.connectionLost));
  }

  /** Olvida los canales (rx/tx) y la cola de salida; con `keepPeripheral` conserva el periférico para reabrir. */
  private teardownLink(keepPeripheral = false): void {
    this.monitorSub?.remove(); this.monitorSub = undefined;
    this.disconnectSub?.remove(); this.disconnectSub = undefined;
    this.writeChain = Promise.resolve();
    this.assembler = new LineAssembler();
    if (!keepPeripheral) {
      this.peripheral = undefined;
      this.connectedId = undefined;
    }
  }

  private failOpen(e: LinkError): void {
    void this.deps.manager.stopDeviceScan().catch(() => undefined);
    if (this.connectedId) void this.deps.manager.cancelDeviceConnection(this.connectedId).catch(() => undefined);
    this.teardownLink();
    this.attempted = false;
    this.wantsOpen = false;
    this.setState(failed(e));
    this.finishOpen(e);
  }

  private finishOpen(error?: LinkError): void {
    clearTimeout(this.openTimer);
    const c = this.openCtl;
    if (!c) return;
    this.openCtl = undefined;
    if (error) c.reject(error);
    else c.resolve();
  }
}
