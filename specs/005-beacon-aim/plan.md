# Implementation Plan: orientar la Yagi escuchando una baliza CW

**Branch**: `005-beacon-aim` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-beacon-aim/spec.md`

## Summary

Ampliación **sin degradación** de la app iOS:
- el escáner y el handshake aceptan también el pinger `PingPong-PI-…` `proto=2` (fw ≥ 0.5.1);
- con él, la pantalla de apuntamiento ofrece un modo **Baliza**: medidor en vivo con `MEAS`, máximo retenido, bisección a −3 dB con el rumbo de cada lectura, tono opcional y CSV del barrido;
- el modo TRACE con `YagiPinger` `proto=1` no cambia.

**Sin firmware en este repo**: el pinger 0.5.1 y la baliza ya existen en `ping-ponger-meshcore`.

## Technical Context

**Language/Version**: Swift 5.9 con Observation (iOS 17+), SwiftUI

**Primary Dependencies**: CoreBluetooth, CoreLocation, CoreMotion, Swift Charts y AVFoundation (sistema). Sin SPM.

**Storage**: `Repeater.beaconFreq` opcional en el JSON de repetidores. Barridos en memoria y exportados en CSV.

**Testing**: XCTest en el simulador `ref` (como la 003); placas reales para SC-002 y SC-004.

**Target Platform**: iPhone (iOS 17+) + pinger Faketec o XIAO con fw ≥ 0.5.1 + baliza `*_cw_beacon_*`

**Project Type**: app móvil (ampliación)

**Performance Goals**: ≥ 5 lecturas/s; UI a 60 fps; el tono sin cortes

**Constraints**: una petición BLE a la vez (el `request()` actual); sin segundo plano; nada de lo existente cambia de comportamiento

**Scale/Scope**: ~600 líneas de Swift y ~250 de tests

## Constitution Check

| Principio | Cumple | Cómo |
|---|---|---|
| I. Compatibilidad verificada | ✅ | No hay cambio de firmware ni de trama; el parser `M` se valida con el fixture del firmware (FR-012, R-7) |
| II. Buen ciudadano | ✅ | En modo baliza el pinger no transmite. La baliza y su normativa están fuera de la app (lo decide el usuario) |
| III. Núcleo puro | ✅ | `BeaconBisect` y el codec `M` son funciones puras con tests; CoreBluetooth, audio y sensores en el cascarón |
| IV. Protocolo único | ✅ | Mismo transporte NUS y mismo `LineAssembler`; solo un evento nuevo |
| V. Test-first | ✅ | Tests de codec `M`, bisección y simulador de baliza antes de la UI |
| VI. Simplicidad | ✅ | Sin SPM ni persistencia nueva; el barrido vive en memoria |
| **No degradación** (de esta fase) | ✅ | FR-001…FR-003; los tests existentes no se modifican; checklist específico |

## Project Structure

### Documentation (this feature)

```text
specs/005-beacon-aim/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/
│   ├── meas-line.md
│   └── beacon-sweep-csv.md
└── checklists/requirements.md
```

### Source Code

```text
MeshAzimuth/
├── Link/
│   ├── LineCodec.swift          cambio: .meas(MeasResult) y parse de "M,"
│   ├── BLELineTransport.swift   cambio: acepta los dos prefijos; PingerDevice.kind
│   ├── LineTransport.swift      cambio: PingerDevice.kind
│   ├── PingerLink.swift         cambio: proto 1|2, mode, meas(), setFrequency(), startMeter/stopMeter
│   └── SimulatedPinger.swift    cambio: BeaconSim (proto=2 + MEAS)
├── Beacon/                      nuevo
│   ├── BeaconBisect.swift       función pura (FR-024)
│   ├── BeaconSession.swift      BeaconSweep, BeaconReading, piso, avisos
│   ├── BeaconTone.swift         US4
│   └── BeaconCSV.swift          US5
├── BeaconCard.swift             nuevo: medidor, máximo, bisección, avisos, "Usar como objetivo"
├── BeaconPolarChart.swift       nuevo: nivel por rumbo (Canvas), cruces y centro
├── AimView.swift                cambio: con un pinger proto=2 muestra BeaconCard en lugar de PingerSection; objetivo temporal
├── PingerPicker.swift           cambio: muestra el tipo de pinger
├── RepeaterStore.swift          cambio: beaconFreq opcional
└── RepeaterViews.swift          cambio: campo "Frecuencia de la baliza" en el editor
MeshAzimuthTests/
├── Fixtures/beacon/events_m.txt nuevo (tools/sync_beacon_fixtures.sh)
├── BeaconCodecTests.swift       nuevo
├── BeaconBisectTests.swift      nuevo
└── BeaconSimTests.swift         nuevo
tools/sync_beacon_fixtures.sh    nuevo
project.yml                      cambio: Fixtures/beacon como recurso de tests
```

**Structure Decision**: carpeta `Beacon/` paralela a `Session/`. El modo TRACE y su sesión no se tocan.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper el handshake `proto=1` al aceptar `proto=2` | Rama por `proto` al principio de `handshake()`; los tests existentes (codec y sesión) pasan sin cambios; prueba manual con `YagiPinger` (checklist) |
| El fixture `M` diverge del firmware | `tools/sync_beacon_fixtures.sh --check` en la verificación |
| Rumbo desfasado de la medida | Rumbo al recibir y barrido lento (R-4); celdas de 2° |
| El tono cruje o sigue sonando | Suavizado por buffer y parada en `scenePhase` y `onDisappear` |
| BLE corto de la Faketec | Pinger en el boom, a < 1 m del teléfono (quickstart) |
