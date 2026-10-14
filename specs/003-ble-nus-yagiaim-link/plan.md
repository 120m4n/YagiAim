# Implementation Plan: Enlace BLE NUS pinger ↔ YagiAim

**Branch**: `003-ble-nus-yagiaim-link` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-ble-nus-yagiaim-link/spec.md`

## Summary

En el firmware, `BLEUart` (NUS) se añade como segundo transporte del mismo protocolo `proto=1`, con difusión de eventos y `STOP` al perder BLE. En YagiAim:
- `PingerLink`, sobre CoreBluetooth y detrás de un protocolo `LineTransport`, con una implementación simulada;
- un parser Swift validado con los fixtures compartidos;
- muestras que guardan el rumbo en TX y en RX, lecturas con medianas, persistencia JSON y exportación CSV.

## Technical Context

**Language/Version**: C++17 (firmware); Swift 5.9 con Observation (iOS 17+)

**Primary Dependencies**: Adafruit Bluefruit nRF52 (fork MeshCore `d541301`); CoreBluetooth y CoreLocation (sistema). Sin paquetes SPM de terceros.

**Storage**: JSON en `Application Support/Sessions`; `UserDefaults` para el último periférico

**Testing**: `pio test -e native` (extensión de `Pinger` por origen); XCTest (`LineCodec`, `Session`, `PingerLink` con `SimulatedPinger`); pruebas manuales con nRF Connect y en campo

**Target Platform**: XIAO nRF52840 + iPhone (iOS 17+)

**Project Type**: firmware + app móvil

**Performance Goals**: conexión ≤ 5 s; latencia BLE ≤ 100 ms p95; UI a 60 fps con actualizaciones cada ≥ 1 s

**Constraints**: 1 central; sin background; la app nunca usa `GO`

**Scale/Scope**: unas 150 LOC de firmware, ~900 Swift y ~400 de tests

## Constitution Check

| Principio | Cumple | Cómo |
|---|---|---|
| I. Compatibilidad verificada | ✅ | No cambia la trama RF; `tracecore` sigue cubierto por la fase 002 |
| II. Buen ciudadano | ✅ | FR-005 (`STOP` al perder BLE), FR-012 (la app no usa `GO` y respeta `rate`); el firmware sigue imponiendo rate y duty |
| III. Núcleo puro | ✅ | El cambio en `tracecore` (origen del comando, `onTransportLost`) es puro y tiene test. BLE vive solo en el cascarón |
| IV. Protocolo único | ✅ | Mismas líneas por BLE; el parser Swift se valida con los fixtures compartidos (FR-011) |
| V. Test-first | ✅ | `LineCodec.swift` y `Session` con TDD; `PingerLink` probado con `SimulatedPinger` |
| VI. Simplicidad | ✅ | Sin SPM ni SwiftData; JSON + Codable |

## Project Structure

### Documentation (this feature)

```text
specs/003-ble-nus-yagiaim-link/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/
│   ├── ble-nus-gatt.md
│   └── session-csv.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
firmware/pinger/
├── src/
│   ├── BleTransport.{h,cpp}        # Bluefruit + BLEUart, adv, framing, onDisconnect
│   ├── CompositeSink.{h,cpp}
│   └── main.cpp                    # + BLE
├── lib/tracecore/…/Pinger.{h,cpp}  # + Origin, onTransportLost
└── test/test_pinger_fsm/test_origin_stop.cpp
    tools/ble_smoke.py              # bleak: HELLO/PING por BLE

ios/
├── project.yml                     # + NSBluetoothAlwaysUsageDescription, recurso de fixtures
├── YagiAim/
│   ├── Link/
│   │   ├── LineCodec.swift
│   │   ├── LineTransport.swift
│   │   ├── BLELineTransport.swift
│   │   ├── SimulatedPinger.swift
│   │   └── PingerLink.swift
│   ├── Session/
│   │   ├── SessionModels.swift     # Sample, Reading, Session
│   │   ├── SessionRecorder.swift   # ráfaga "Medir aquí", reglas unstable/mediana
│   │   ├── SessionStore.swift      # JSON
│   │   └── SessionCSV.swift
│   ├── Views/
│   │   ├── LinkCard.swift          # estado, SNR, RSSI, RTT, pérdida, sparkline
│   │   ├── PingerPicker.swift
│   │   └── SessionView.swift       # lista de lecturas + exportar
│   ├── RepeaterStore.swift         # + hashPrefix
│   ├── Geo.swift                   # + circularMean, median
│   └── ContentView.swift           # AimView integra LinkCard y "Medir aquí"
└── YagiAimTests/
    ├── LineCodecTests.swift        # fixtures compartidos
    ├── SessionRecorderTests.swift
    ├── SessionCSVTests.swift
    ├── PingerLinkSimTests.swift
    └── RepeaterMigrationTests.swift
```

**Structure Decision**: La lógica de app se organiza en `Link/` y `Session/`, que no dependen de SwiftUI, y `Views/`. `ContentView.swift` se trocea solo lo necesario: `AimView` pasa a `Views/AimView.swift` (T-refactor en tasks).

## Complexity Tracking

Sin violaciones.
