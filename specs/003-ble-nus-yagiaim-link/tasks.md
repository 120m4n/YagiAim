---

description: "Task list for 003-ble-nus-yagiaim-link"
---

# Tasks: Enlace BLE NUS pinger ↔ MeshAzimuth

**Input**: Design documents from `/specs/003-ble-nus-yagiaim-link/`

**Prerequisites**: 001 (firmware, implementado y flasheado en Meshcore `0b85c69e`) y 002 (fixtures de líneas, Meshcore `22ccc0b2`). El código de firmware vive en el repo Meshcore; la app, en la raíz de este repo.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 [P] `project.yml`: `NSBluetoothAlwaysUsageDescription` ("MeshAzimuth se conecta al pinger LoRa para medir la calidad del enlace con el repetidor.") y la carpeta `Fixtures/lines` como recurso de `MeshAzimuthTests` (research R-8); `xcodegen generate`
- [ ] T002 [P] `Meshcore/variants/xiao_nrf52/platformio.ini` (env `Xiao_nrf52_trace_pinger`): añadir `BleTransport.cpp` al `build_src_filter`. Bluefruit ya viene en el framework fork (verificado: lo usa `SerialBLEInterface`)
- [x] T003 ~~Refactor: mover `AimView` y vistas de repetidores fuera de `ContentView.swift`~~ **Ya hecho**: `AimView.swift` y `RepeaterViews.swift` existen por separado; no hay refactor que hacer

## Phase 2: Foundational

- [x] T038 [P] `tools/sync_fixtures.sh`: sin argumentos copia los 5 archivos de `$MESHCORE_DIR/examples/trace_pinger/tests/fixtures/lines/` a `MeshAzimuthTests/Fixtures/lines/`; con `--check` compara byte a byte y sale ≠ 0 si difieren (research R-8). Hacer la primera copia
- [ ] T004 [P] Test `MeshAzimuthTests/LineCodecTests.swift`: recorre `Fixtures/lines/events_*.txt` e `info.txt` y compara el JSON con `PingerEvent` (incluida la línea `S,` con `busy`); las `reply` de `commands.txt` se parsean como `.ok`/`.warn`/`.error`; prefijos desconocidos → `.unknown`; caso de reensamblado (`"P,1,AB"` + `"CD…\nP,2…"`) → 2 líneas
- [ ] T005 [P] `MeshAzimuth/Link/LineCodec.swift`: `parse(_ line:) -> PingerEvent` y `LineAssembler` (buffer → líneas completas, tope 160 B, descarte en overflow)
- [ ] T006 [P] `MeshAzimuth/Link/LineTransport.swift`: protocolo `LineTransport` y `LinkState`
- [ ] T007 [P] `Geo.swift`: `circularMean([Double])` y `median([Double])` (regla de pares de la 001), con tests en `GeoTests.swift` (359/1 → 0; [1,2,3,4] → 2.5)

**Checkpoint**: el codec Swift pasa el 100 % de los fixtures (SC-006).

---

## Phase 3: User Story 1 — NUS en el pinger (P1) 🎯 MVP

- [ ] T039 [P] [US1] Añadir `#WARN ble_lost_stop` a `001/contracts/line-protocol.md` y a `info.txt` de Meshcore (FR-018); re-sincronizar los fixtures con T038
- [ ] T040 [P] [US1] `tracecore/LineAssembler.h` puro (buffer → líneas completas, tope 160 B, descarte en overflow con `!ERR syntax`) con test en `tests/test_line_assembler/`; `main.cpp` lo usa para Serial en lugar de su lector ad hoc
- [ ] T008 [P] [US1] Test `examples/trace_pinger/tests/test_pinger_fsm/test_origin_stop.cpp`: `GO` desde Ble + `onTransportLost(Ble)` → `STOP` y `#WARN ble_lost_stop`; `GO` desde Serial + `onTransportLost(Ble)` → sigue; ráfaga desde Ble + pérdida → detiene; `onCommand` sin `Origin` sigue comportándose como Serial
- [ ] T009 [US1] `tracecore::Pinger`: parámetro `Origin` en `onCommand` (por defecto `Serial`), `onTransportLost(Origin)` que emite `#WARN ble_lost_stop` al hacer `STOP`
- [ ] T010 [P] [US1] `examples/trace_pinger/CompositeSink.h`: `LineSink::line(const char*, size_t)` que difunde a Serial y BLE (si está READY)
- [ ] T011 [US1] `examples/trace_pinger/BleTransport.{h,cpp}`: `Bluefruit.begin(1,0)`, nombre `YagiPinger-<4hex>`, `BLEUart` leído por sondeo desde `loop()` → `LineAssembler` (T040), sin lógica en callbacks; `setDisconnectCallback` solo activa una bandera `volatile` que `loop()` convierte en `pinger.onTransportLost(Ble)` (FR-019); `configPrphConn` (MTU 247) antes de `begin`; parámetros de `contracts/ble-nus-gatt.md`; advertising de 100 ms → 500 ms tras 30 s
- [ ] T012 [US1] `main.cpp`: integrar BLE; los comandos de cada transporte llevan su `Origin`
- [ ] T013 [US1] `examples/trace_pinger/tools/ble_smoke.py` (bleak, corre desde la Mac): escaneo, `HELLO`, `CFG?`, `PING`, verificación del formato y latencia promedio de 20 pings
- [ ] T014 [US1] Prueba manual con nRF Connect: US1-AS1…AS5; registrar el MTU negociado con iPhone en `bench-log.md`

---

## Phase 4: User Story 2 — App conectada y "En vivo" (P1)

### Tests

- [ ] T015 [P] [US2] `MeshAzimuthTests/PingerLinkSimTests.swift` con `SimulatedPinger`: conectar → `HELLO` → `SET hash=A1` en orden; `proto=2` → `.failed(incompatible)`; el handshake envía `HELLO`, `STOP`, `MON off`, `CFG?`, `SET hash` en orden; `ping()` se resuelve con el `P,` aunque lleguen `#WARN` intercaladas, lanza con `!ERR state busy` y con el timeout local, y reporta `#WARN duty_wait`; `startLive` usa `max(rate, 2000 ms)` y espera cada resultado; `stopLive` detiene; la pérdida de transporte pasa a `.failed` y reintenta
- [ ] T016 [P] [US2] `MeshAzimuthTests/RepeaterMigrationTests.swift`: un JSON v1 sin `hashPrefix` decodifica; la validación de `hashPrefix` acepta solo `^[0-9A-F]{2}$` y normaliza a mayúsculas

### Implementación

- [ ] T017 [P] [US2] `SimulatedPinger.swift` (research R-6), con `heading` y reloj inyectables para tests deterministas (semilla); imita al firmware: `P,` tras ≈ 1.4 s, `!ERR state busy` con un ping pendiente y `#WARN duty_wait` según el límite del 10 %
- [ ] T018 [P] [US2] `RepeaterStore.swift`: `hashPrefix` con `decodeIfPresent`; `RepeaterEditor` con un campo "Prefijo hash (2 hex)" y ayuda
- [ ] T019 [US2] `BLELineTransport.swift`: `CBCentralManager` (cola propia), escaneo por servicio NUS, lista de periféricos, conexión, descubrimiento, `setNotifyValue`, escritura `.withoutResponse` fragmentada según `maximumWriteValueLength`, `LineAssembler`, `AsyncStream<String>`, recordar el último `identifier` en `UserDefaults`
- [ ] T020 [US2] `PingerLink.swift` (`@Observable`): handshake (`HELLO` → proto → `STOP` → `MON off` → `CFG?` → `SET hash`), `configure(hash:)`, `ping() async throws` (resuelve con `P,`, `!ERR` o timeout local), `startLive/stopLive` (un `Task` con intervalo `max(rate, 2000 ms)` que espera cada `P,`), `history` de 30, reconexión con backoff 1-2-4 s mientras haya interés
- [ ] T021 [P] [US2] `PingerPicker.swift`: estados de Bluetooth (apagado, sin permiso con botón a Ajustes, buscando, lista)
- [ ] T022 [P] [US2] `LinkCard.swift`: estado, SNR↑ / SNR↓ / RSSI / RTT / pérdida, sparkline de SNR↑ con Swift Charts (`LineMark`) y avisos `#WARN duty_wait` y `hash_collision` visibles
- [ ] T023 [US2] `AimView.swift`: botón "Conectar pinger", `LinkCard`, interruptor "En vivo"; `stopLive` en `onDisappear` y al pasar a background (`scenePhase`)
- [ ] T024 [US2] Ajustes de depuración: interruptor "Pinger simulado" (inyecta `SimulatedPinger`)

---

## Phase 5: User Story 3 — Lecturas atadas al rumbo (P2)

- [ ] T025 [P] [US3] `MeshAzimuthTests/SessionRecorderTests.swift`: 5 muestras con heading estable → `Reading` con medianas correctas; 2 de 5 con Δheading de 3° → `unstable` y excluidas; 3 inestables → `needsRepeat`; una muestra con `#WARN duty_wait` → `invalid` y excluida; media circular de 358/2/0; `delta` con signo; `headingAccuracy=20` → rechaza con `.needsCalibration`
- [ ] T026 [US3] `Session/SessionModels.swift` (`Sample`, `Reading`, `Session`)
- [ ] T027 [US3] `Session/SessionRecorder.swift`: `measureHere(n:)` usa `PingerLink.ping()` y lee `LocationManager.heading` al enviar (tx) y al recibir (rx); aplica las reglas de data-model
- [ ] T028 [US3] UI: botón "Medir aquí" en `AimView` (deshabilitado si no hay conexión, brújula o hash) con progreso 1/5…5/5 y feedback háptico al terminar
- [ ] T029 [US3] SC-005: test de integración `PingerLinkSimTests.testSweepFindsAzimuth` con `SimulatedPinger` + 7 lecturas en {0, ±15, ±30, ±60, 180}: el máximo de SNR↑ queda en Δ = 0 ± 1°

---

## Phase 6: User Story 4 — Persistencia y CSV (P3)

- [ ] T030 [P] [US4] `MeshAzimuthTests/SessionCSVTests.swift`: cabecera exacta del contrato, escapado RFC 4180 (nombre de repetidor con coma o comillas), formato de fechas, vacíos en timeout
- [ ] T031 [P] [US4] `Session/SessionStore.swift`: guardar/cargar/listar por repetidor en `Application Support/Sessions`
- [ ] T032 [P] [US4] `Session/SessionCSV.swift`
- [ ] T033 [US4] `SessionView.swift`: lista de lecturas (Δ, SNR↑, SNR↓, pérdida, marca de repetir) + `ShareLink` del CSV; historial desde `RepeaterList`

---

## Phase 7: Polish & validación

- [ ] T034 Banco BLE: SC-001 (conexión ≤ 5 s), SC-002 (latencia vs Serial, con `ble_smoke.py` y la app), SC-003 (30 min "En vivo") (iPhone físico; "En vivo" a 2 s) → `specs/003-ble-nus-yagiaim-link/bench-log.md`
- [ ] T035 Campo: SC-004 girando a propósito durante "Medir aquí"; ajustar el umbral `unstable` si hace falta (research R-4)
- [ ] T036 [P] README de la app (`README.md` de la raíz) y `examples/trace_pinger/README.md` en Meshcore: flujo de campo completo
- [ ] T037 Revisar FR-007 (PIN/bonding) con los resultados de campo y decidir para v2

## Dependencies & Execution Order

- Setup → Foundational (T004–T007) → US1 (firmware) y US2 (app) **en paralelo**: US2 se desarrolla contra `SimulatedPinger` sin esperar el firmware.
- T019 (BLE real) necesita US1 terminado para la prueba manual. Su código puede escribirse antes.
- US3 depende de US2 (`PingerLink.ping()`); US4 depende de US3 (modelos).

### Parallel Example

```bash
# Equipo firmware            # Equipo iOS
T008 → T009 → T010/T011 …    T015/T016 → T017/T018 → T020 → T021/T022 …
```

## Trazabilidad FR → tareas

| FR | Tareas |
|---|---|
| FR-001, FR-002, FR-006 | T011, T014 |
| FR-003 | T011, T005, T019 |
| FR-004 | T010, T012 |
| FR-005 | T008, T009, T011 |
| FR-007 | T037 |
| FR-008 | T002 |
| FR-009 | T019, T021 |
| FR-010 | T006, T017, T024 |
| FR-011 | T004, T005, T038 |
| FR-018 | T039 |
| FR-019 | T011, T040 |
| FR-012 | T015, T020 |
| FR-013 | T016, T018 |
| FR-014 | T025, T026, T027 |
| FR-015 | T025, T027 |
| FR-016 | T030, T031, T032, T033 |
| FR-017 | T001 |

## Implementation Strategy

MVP de la fase = US1 + US2: ver el SNR del repetidor en vivo en el teléfono sobre el boom. US3 convierte eso en datos para el barrido de la fase 004.
