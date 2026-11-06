---

description: "Task list for 005-beacon-aim"
---

# Tasks: Orientar la Yagi escuchando una baliza CW

**Input**: Design documents from `/specs/005-beacon-aim/`

**Prerequisites**: 003 (enlace BLE, `PingerLink`, `SimulatedPinger`) implementada. Firmware del pinger ≥ 0.5.1 y de la baliza en `ping-ponger-meshcore` (rama `exp/analizador-pobre`). Solo iOS: Android queda fuera.

## Regla de esta fase: ampliación sin degradación

- No se modifica ningún test existente. Si un test existente falla, el cambio está mal.
- El flujo TRACE con `YagiPinger` `proto=1` no cambia de comportamiento (FR-001).
- Antes de cada commit: todos los tests en verde (`xcodebuild test`, simulador `ref`).

## Política de pruebas y commits

Tests permanentes **solo donde hay riesgo real**: codec `M` (fixture del firmware), bisección y simulador de baliza. La UI se verifica con el simulador y capturas. Commits **por bloque**: enlace (Fase 2), núcleo de baliza (Fase 3), UI (Fase 4) y extras (Fases 5–6).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Crear la rama `005-beacon-aim` desde la rama principal de trabajo; confirmar en verde los tests existentes (línea base de SC-001) y anotar cuántos son
- [ ] T002 [P] `tools/sync_beacon_fixtures.sh`: copia **solo** `events_m.txt` de `${PINGPONGER_DIR:-/Users/120m4n/GitHub/ping-ponger-meshcore}/firmware/examples/trace_pinger/tests/fixtures/lines/` a `MeshAzimuthTests/Fixtures/beacon/`; `--check` compara y sale ≠ 0 si difieren (research R-7). No tocar `tools/sync_fixtures.sh`
- [ ] T003 [P] `project.yml`: `Fixtures/beacon` como recurso de `MeshAzimuthTests`; `xcodegen generate`

## Phase 2: Foundational — enlace (US1)

- [ ] T010 [P] [US1] Test `BeaconCodecTests.swift`: cada línea de `Fixtures/beacon/events_m.txt` parsea a `.meas` con los valores del JSON; líneas `M` mal formadas (`M,64,61,-65.0`, `kept > n`) → `.unknown`; `clean` con `kept/n` 0,8 en el límite
- [ ] T011 [US1] `LineCodec.swift`: `MeasResult` y `.meas` (data-model). No cambiar el parseo del resto de eventos
- [ ] T012 [P] [US1] `LineTransport.swift` y `BLELineTransport.swift`: `PingerDevice.kind`; el escaneo acepta `YagiPinger-` y `PingPong-PI-`
- [ ] T013 [US1] `PingerLink.swift`: `handshake()` acepta `proto=1` (igual que hoy) o `proto=2` + `role=pinger` + fw ≥ 0.5.1 (si no, `LinkError.incompatibleFirmware`); con `proto=2` no manda `SET hash`. `mode`; `ping()`, `startLive()` y `configure(hash:)` rechazan `proto=2`
- [ ] T014 [US1] `PingerLink.swift`: `setFrequency(_:)`, `meas(n:)` y `startMeter(onReading:)`/`stopMeter()` (bucle sin pausa, `!ERR state busy` = siguiente ciclo, se detiene al perder el enlace y se retoma tras reconectar, como `runLive`). Exclusivo con "En vivo"
- [ ] T015 [US1] `PingerPicker.swift`: muestra el tipo ("TRACE" o "baliza") de cada pinger

**Checkpoint**: tests existentes en verde sin cambios + `BeaconCodecTests` en verde. Commit "enlace".

## Phase 3: Núcleo de baliza (US2, US3)

- [ ] T020 [P] [US3] Test `BeaconBisectTests.swift`:
  - patrón simétrico con centro en 37° → `found` a ±1°;
  - patrón asimétrico;
  - ruido de 0,5 dB (semilla fija), 10 barridos → ≥ 9 a ±3° (SC-003);
  - solo el lado izquierdo barrido → `needRight`;
  - centro en 358° con cruces en 330° y 26° → centro ≈ 358°;
  - lecturas no válidas ignoradas; hueco de > 20° corta ese lado;
  - menos de 3 celdas → `notEnough`
- [ ] T021 [US3] `Beacon/BeaconBisect.swift` (data-model; reutilizar `Geo.circularMean` y `Geo.normalize`)
- [ ] T022 [US2] `Beacon/BeaconSession.swift`: `BeaconReading`, `BeaconSweep` (piso al empezar, `valid`, máximo retenido, bisección recalculada, avisos FR-025, `reset()`)
- [ ] T023 [P] [US2] `SimulatedPinger.swift`: `BeaconSim` (FR-028), reutilizando `yagiGain` y `SimInputs`
- [ ] T024 [US2] Test `BeaconSimTests.swift`: `PingerLink` contra `SimulatedPinger` en modo baliza: handshake `proto=2`; `setFrequency` + `meas` → nivel alto con el rumbo en el objetivo y ~piso con otra frecuencia; `startMeter` entrega ≥ 3 lecturas y se detiene con `stopMeter`; `ping()` lanza `mode`

**Checkpoint**: todos los tests en verde. Commit "núcleo baliza".

## Phase 4: UI (US2, US3) 🎯 MVP

- [ ] T030 [US2] `RepeaterStore.swift`: `beaconFreq: String?` con `decodeIfPresent`; `RepeaterViews.swift`: campo "Frecuencia de la baliza (MHz)" con validación FR-020
- [ ] T031 [US2] `BeaconCard.swift`:
  - nivel actual grande;
  - máximo retenido con su rumbo y una barra de "dB bajo el máximo";
  - piso;
  - avisos FR-025, con el texto de los casos borde de la spec;
  - "Nuevo barrido";
  - contador de lecturas descartadas
- [ ] T032 [US3] `BeaconPolarChart.swift`: nivel por rumbo (Canvas polar), el azimut del mapa, los cruces de −3 dB y el centro
- [ ] T033 [US3] `BeaconCard`: resultado de la bisección (centro, ancho del haz, diferencia con el azimut del mapa) o "barre más a la izquierda/derecha"; botón "Usar como objetivo"
- [ ] T034 [US2] `AimView.swift`: con un pinger `proto=2` muestra `BeaconCard` en lugar de `PingerSection` (con `proto=1`, sin cambios); objetivo temporal para `CompassView` (FR-026); `stopMeter` en `onDisappear` y en `scenePhase != .active`
- [ ] T035 Comprobar en el simulador las US2 y US3 con el pinger simulado de baliza; capturas para la revisión

**Checkpoint**: MVP usable en el simulador. Commit "UI baliza".

## Phase 5: Tono (US4, P2)

- [ ] T040 [US4] `Beacon/BeaconTone.swift` (research R-8) e interruptor en `BeaconCard`, apagado por defecto

## Phase 6: CSV del barrido (US5, P3)

- [ ] T050 [P] [US5] Test del CSV contra `contracts/beacon-sweep-csv.md` (cabecera, una `R` y la `B`, escape RFC 4180)
- [ ] T051 [US5] `Beacon/BeaconCSV.swift` y botón "Exportar barrido" (hoja de compartir)

## Phase 7: Verificación

- [ ] T060 Todos los tests en verde; ninguno de los existentes modificado (comparar con la línea base de T001)
- [ ] T061 `tools/sync_fixtures.sh --check` y `tools/sync_beacon_fixtures.sh --check` en verde
- [ ] T062 Prueba manual de no degradación con `YagiPinger` (quickstart, último apartado)
- [ ] T063 Con placas: SC-002 (≥ 5 lecturas/s) y SC-004 (dos barridos a ≤ 5° en un enlace de ≥ 200 m); anotar los resultados en `bench-log.md` de esta carpeta
- [ ] T064 README: sección corta "Orientar con baliza (enlaces nuevos)" con el enlace a la guía de flasheo de la baliza

## FR → tareas

| FR | Tareas |
|---|---|
| FR-001…003 | T001, T060–T062 |
| FR-010 | T012, T015 |
| FR-011 | T013 |
| FR-012 | T002, T010, T011 |
| FR-013 | T014 |
| FR-020 | T030 |
| FR-021, FR-022, FR-023, FR-025 | T022, T031 |
| FR-024 | T020, T021, T033 |
| FR-026 | T033, T034 |
| FR-027 | T040 |
| FR-028 | T023, T024 |
