# Data Model: 004 Port a React Native

Traducción 1:1 de los tipos Swift. Los nombres de campo son **idénticos** a los de Swift porque se serializan con el mismo JSON (SF-03, SF-04). Los opcionales de Swift son `T | undefined` (se omiten al serializar, nunca `null`).

## Núcleo (`src/core/`)

```ts
// RepeaterStore.swift
export interface Repeater {
  id: string;            // UUID en mayúsculas (FS-12)
  name: string;
  latitude: number;
  longitude: number;
  altitude?: number;     // m s.n.m.
  hashPrefix?: string;   // "A1"
}

// LineCodec.swift
export type PingStatus = "ok" | "timeout" | "busy" | "txerr";
export interface PingResult {
  seq: number;           // UInt32
  tag: string;           // 8 hex en mayúsculas
  status: PingStatus;
  rttMs?: number;        // UInt32, solo si ok
  snrUp?: number; snrDn?: number; rssiDn?: number;
  nResp: number;         // UInt8
}
export interface BurstSummary { n: number; ok: number; lossPct?: number; medSnrUp?: number; medSnrDn?: number; medRssiDn?: number; busy: number }
export interface RawFrame { tMs: number; rssi: number; snr: number; hex: string; truncated: boolean }
export type PingerEvent =
  | { kind: "hello"; fw: string; proto: number; radio: string; id: string }
  | { kind: "cfg"; values: Record<string, string> }
  | { kind: "ok"; text: string }
  | { kind: "warn"; code: string; detail?: string }
  | { kind: "error"; code: string; detail?: string }
  | { kind: "ping"; result: PingResult }
  | { kind: "summary"; summary: BurstSummary }
  | { kind: "raw"; frame: RawFrame }
  | { kind: "unknown"; line: string };

// SessionModels.swift
export interface Sample {
  id: string; readingIndex: number;
  tTx: Date; tRx: Date;                      // JSON: segundos desde 2001 (FS-07)
  headingTx: number; headingRx: number; headingAccuracy: number;
  latitude: number; longitude: number; altitude?: number; hAccuracy: number;
  targetBearing: number; delta: number;
  unstable: boolean; invalid: boolean;
  result: PingResult;
}
export interface Reading {
  id: string; index: number;
  meanHeading?: number; meanDelta?: number;
  medSnrUp?: number; medSnrDn?: number; medRssiDn?: number;
  lossPct?: number; stableCount: number; needsRepeat: boolean;
}
export interface Session {
  id: string; repeater: Repeater; started: Date;
  txpDbm?: number; fw?: string; proto: number;
  readings: Reading[]; samples: Sample[];
}

// AimInfo.swift
export interface AimInfo { bearing: number; distance: number; elevation?: number; delta?: number }
```

## Enlace (`src/link/`)

```ts
// LineTransport.swift
export type LinkError =
  | { kind: "bluetoothOff" } | { kind: "unauthorized" } | { kind: "deviceNotFound" }
  | { kind: "connectionLost" } | { kind: "incompatibleFirmware"; proto: number }
  | { kind: "timeout" } | { kind: "writeFailed" };
export type LinkState =
  | { kind: "idle" } | { kind: "scanning" } | { kind: "connecting" } | { kind: "ready" }
  | { kind: "failed"; error: LinkError };
export interface PingerDevice { id: string /* UUID en iOS, MAC en Android (PM-09) */; name: string; fw?: string; proto?: number }

export interface LineTransport {
  readonly state: LinkState;
  states: AsyncIterable<LinkState>;   // equivale a AsyncStream; termina en close()
  lines: AsyncIterable<string>;
  open(): Promise<void>;              // rechaza con LinkError
  close(): void;
  send(line: string): Promise<void>;
}

// PingerLink.swift
export interface PingReport { result: PingResult; tTx: Date; tRx: Date; dutyWait: boolean }
export type PingerError = { kind: "rejected"; code: string; detail?: string } | { kind: "requestInFlight" };
export class RingBuffer<T> { constructor(readonly capacity: number) {} /* append, removeAll, elements */ }

// SimulatedPinger.swift
export interface SimConfig {      // valores por defecto de SimulatedPinger.Config
  snr0: number;            // 8.0
  n: number;               // 8.0
  frontToBackDB: number;   // 12.0
  noiseSigma: number;      // 0.75
  lossProbability: number; // 0.05
  delayScale: number;      // 1.0
  seed: bigint;            // 1n (UInt64)
}
export class SimInputs { heading?: number; target?: number }
```

Los mensajes de `LinkError` y la regla `opensSettings` están en `link/lineTransport.ts` y son los literales de `LineTransport.swift` L29–42.

## Sesión (`src/session/`)

```ts
export type MeasureError = "notReady" | "noHash" | "needsCalibration" | "noLocation" | "measuring";
```

## Estado observable (`src/state/`)

Una tienda por clase `@Observable`, con las mismas propiedades públicas:

| Tienda | Propiedades (iguales a Swift) |
|---|---|
| `locationStore` | `location`, `rawHeading`, `headingOffset`, `heading` (derivada), `headingAccuracy`, `authorization`, `usingMagneticFallback`, `isCachedLocation` |
| `repeaterStore` | `repeaters`, `selectedID`, `selected` (derivada) |
| `motionStore` | `pitch` |
| `networkStore` | `isOnline` |
| `pingerLink` | `state`, `device`, `config`, `last`, `history`, `live`, `lastWarning`, `hash`, `isOperational` (derivada) |
| `sessionRecorder` | `current`, `measuring`, `done`, `total` |
| `pingerScanner` | `devices`, `state`, `timedOut` |

`Location` (equivalente a `CLLocation`): `{ latitude, longitude, altitude /* MSL, PM-08 */, horizontalAccuracy, verticalAccuracy /* <0 = no válida */, timestamp: Date }`.
