# Implementation Plan: Enlace BLE NUS pinger ↔ MeshAzimuth

**Branch**: `003-ble-nus-yagiaim-link` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-ble-nus-yagiaim-link/spec.md`

## Summary

En el firmware, `BLEUart` (NUS) se añade como segundo transporte del mismo protocolo `proto=1`, con difusión de eventos y `STOP` al perder BLE. En MeshAzimuth:
- `PingerLink`, sobre CoreBluetooth y detrás de un protocolo `LineTransport`, con una implementación simulada;
- un parser Swift validado con los fixtures compartidos;
- muestras que guardan el rumbo en TX y en RX, lecturas con medianas, persistencia JSON y exportación CSV.

## Technical Context

**Language/Version**: C++17 (firmware); Swift 5.9 con Observation (iOS 17+)

**Primary Dependencies**: Adafruit Bluefruit nRF52 (fork MeshCore `d541301`); CoreBluetooth y CoreLocation (sistema). Sin paquetes SPM de terceros.

**Storage**: JSON en `Application Support/Sessions`; `UserDefaults` para el último periférico

**Testing**: `./examples/trace_pinger/run_tests.sh` (extensión de `Pinger` por origen); XCTest (`LineCodec`, `Session`, `PingerLink` con `SimulatedPinger`); pruebas manuales con nRF Connect y en campo

**Target Platform**: XIAO nRF52840 + iPhone (iOS 17+)

**Project Type**: firmware + app móvil

**Performance Goals**: conexión ≤ 5 s; latencia BLE ≤ 100 ms p95; UI a 60 fps con actualizaciones cada ≥ 1 s

**Constraints**: 1 central; sin background; la app nunca usa `GO` y su cadencia en vivo es ≥ 2 s

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

### Source Code

```text
Meshcore/examples/trace_pinger/                # repo Meshcore, rama feature/i2c-actuator-public-channel
├── BleTransport.{h,cpp}        # Bluefruit + BLEUart: advertising, sondeo desde loop(), bandera de desconexión
├── CompositeSink.h             # difunde las líneas a Serial y BLE
├── main.cpp                    # + BLE; cada transporte pasa su Origin
├── tracecore/…                 # Pinger + Origin (por defecto Serial) y onTransportLost; LineAssembler puro
├── tests/test_pinger_fsm/test_origin_stop.cpp, tests/test_line_assembler/
└── tools/ble_smoke.py          # bleak (desde la Mac): HELLO/CFG?/PING por BLE
Meshcore/variants/xiao_nrf52/platformio.ini    # env Xiao_nrf52_trace_pinger: + BleTransport.cpp en build_src_filter

MeshAzimuth/ (raíz de este repo)
├── project.yml                     # + NSBluetoothAlwaysUsageDescription, carpeta de fixtures en el target de tests
├── tools/sync_fixtures.sh          # copia y --check contra Meshcore
├── MeshAzimuth/
│   ├── Link/       LineCodec, LineTransport, BLELineTransport, SimulatedPinger, PingerLink (.swift)
│   ├── Session/    SessionModels, SessionRecorder, SessionStore, SessionCSV (.swift)
│   ├── LinkCard.swift, PingerPicker.swift, SessionView.swift     # vistas nuevas, planas como el resto de la app
│   ├── RepeaterStore.swift         # + hashPrefix
│   ├── Geo.swift                   # + circularMean, median
│   └── AimView.swift               # integra LinkCard y "Medir aquí"
└── MeshAzimuthTests/
    ├── LineCodecTests, SessionRecorderTests, SessionCSVTests, PingerLinkSimTests, RepeaterMigrationTests (.swift)
    ├── GeoTests.swift              # ampliado
    └── Fixtures/lines/*.txt        # copia verificada
```

**Structure Decision**: La lógica de app se organiza en `Link/` y `Session/`, que no dependen de SwiftUI. Las vistas nuevas van junto a las existentes (la app es plana) y `AimView.swift` ya está separado de `ContentView.swift`, así que no hay refactor previo. El firmware añade archivos dentro de `examples/trace_pinger/` y solo toca el env de PlatformIO del pinger.

## Complexity Tracking

Sin violaciones.
