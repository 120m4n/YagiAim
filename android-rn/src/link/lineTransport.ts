// Link/LineTransport.swift — canal de líneas `proto=1` con el pinger: BLE NUS en campo, `SimulatedPinger` en demos.
//
// Contrato para las implementaciones:
// - `lines` entrega líneas completas, sin `\n` (reensambladas con `LineAssembler`).
// - `send` añade el `\n` y fragmenta según el MTU; lanza `LinkError` si el enlace no está `ready`.
// - `states` publica cada transición de `state` en orden y termina en `close()`.
import type { AsyncStream } from './async';

export type LinkError =
  | { kind: 'bluetoothOff' }
  | { kind: 'unauthorized' }
  | { kind: 'deviceNotFound' }
  | { kind: 'connectionLost' }
  | { kind: 'incompatibleFirmware'; proto: number }
  | { kind: 'timeout' }
  | { kind: 'writeFailed' };

export type LinkState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'connecting' }
  | { kind: 'ready' }
  | { kind: 'failed'; error: LinkError };

export const idle: LinkState = { kind: 'idle' };
export const scanning: LinkState = { kind: 'scanning' };
export const connecting: LinkState = { kind: 'connecting' };
export const ready: LinkState = { kind: 'ready' };
export const failed = (error: LinkError): LinkState => ({ kind: 'failed', error });

export const linkErrors = {
  bluetoothOff: { kind: 'bluetoothOff' },
  unauthorized: { kind: 'unauthorized' },
  deviceNotFound: { kind: 'deviceNotFound' },
  connectionLost: { kind: 'connectionLost' },
  timeout: { kind: 'timeout' },
  writeFailed: { kind: 'writeFailed' },
} as const satisfies Record<string, LinkError>;

export const isLinkError = (e: unknown): e is LinkError =>
  typeof e === 'object' && e !== null && 'kind' in e &&
  ['bluetoothOff', 'unauthorized', 'deviceNotFound', 'connectionLost', 'incompatibleFirmware', 'timeout', 'writeFailed'].includes((e as { kind: string }).kind);

/** Texto que ve el usuario. */
export function linkErrorMessage(e: LinkError): string {
  switch (e.kind) {
    case 'bluetoothOff': return 'Bluetooth apagado. Actívalo en Ajustes.';
    case 'unauthorized': return 'MeshAzimuth no tiene permiso de Bluetooth. Actívalo en Ajustes.';
    case 'deviceNotFound': return 'No se encontró el pinger.';
    case 'connectionLost': return 'Conexión con el pinger perdida.';
    case 'incompatibleFirmware': return `Firmware incompatible (proto=${e.proto})`;
    case 'timeout': return 'El pinger no responde.';
    case 'writeFailed': return 'No se pudo enviar el comando al pinger.';
  }
}

/** La pantalla debe ofrecer un botón a Ajustes (nunca un spinner infinito). */
export const opensSettings = (e: LinkError): boolean => e.kind === 'bluetoothOff' || e.kind === 'unauthorized';

export const stateIsReady = (s: LinkState): boolean => s.kind === 'ready';
export const stateFailure = (s: LinkState): LinkError | undefined => (s.kind === 'failed' ? s.error : undefined);

/** Pinger descubierto. La identidad es el identificador del periférico (UUID en iOS, MAC en Android — PM-09). */
export interface PingerDevice {
  id: string;
  name: string; // "YagiPinger-1A2B"
  fw?: string; // tras #HELLO
  proto?: number;
}

export interface LineTransport {
  readonly state: LinkState;
  readonly states: AsyncStream<LinkState>;
  readonly lines: AsyncStream<string>;
  /** Conecta hasta `ready` o rechaza con el `LinkError` correspondiente. */
  open(): Promise<void>;
  close(): void;
  send(line: string): Promise<void>;
}
