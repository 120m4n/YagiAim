---

description: "Task list for 001-trace-pinger-firmware"
---

# Tasks: Pinger TRACE mínimo

**Input**: Design documents from `/specs/001-trace-pinger-firmware/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Obligatorios para `tracecore` (Constitución V). Las pruebas RF son manuales y están en quickstart.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1–US4 de spec.md
- Rutas relativas a la raíz del repo

## Phase 0: Spike de des-riesgo con `kiss_modem` oficial (≤ 2 h, recomendado)

**Purpose**: Comprobar con el repetidor real que el eco TRACE existe y trae el SNR antes de escribir firmware (research R-9).

- [ ] S001 Flashear `$MESHCORE_DIR` (`/Users/120m4n/GitHub/Meshcore`) con el env `Xiao_nrf52_kiss_modem` (existe en `variants/xiao_nrf52/platformio.ini`) en el XIAO
- [ ] S002 `firmware/pinger/tools/spike_kiss_trace.py` (pyserial): `SetRadio` (915.8 / 250 / 10 / 5), `SetTxPower=2`, `TXDELAY=0`; enviar `Data(26 00 <tag> 00000000 00 <H>)`; esperar `Data` + `RxMeta` ≤ 2 s; imprimir `snr_up=(int8)b[2]/4`, `snr_dn`, `rssi_dn`, RTT
- [ ] S003 Correr 10 pings y guardar las tramas crudas en `firmware/pinger/test/fixtures/frames/spike-kiss-<fecha>.txt` (primeros fixtures reales para la fase 002)

**Gate**: ≥ 8/10 ecos → seguir con Phase 1. Si no, revisar el hash, la antena y `direct.txdelay` del repetidor antes de invertir en firmware.

---

## Phase 1: Setup

- [ ] T001 Crear `firmware/pinger/UPSTREAM.md` con la ruta `MESHCORE_DIR=/Users/120m4n/GitHub/Meshcore`, la rama `feature/i2c-actuator-public-channel` y el commit `362ea302`. No hay submódulo
- [ ] T002 Crear `firmware/pinger/platformio.ini` con los entornos `xiao_nrf52` (`boards_dir = ${sysenv.MESHCORE_DIR}/boards`, `platform_packages` fork, RadioLib `6d89348`, `build_unflags = -std=gnu++11`, `build_flags = -std=gnu++17`; comprobar antes si PlatformIO ya trae el board `seeed-xiao-afruitnrf52-nrf52840`) y `native` (gtest 1.17, `build_src_filter = -<*>`, `lib_compat_mode = off`)
- [ ] T003 [P] Crear `firmware/pinger/lib/tracecore/library.json` y el árbol `include/tracecore/`, `src/`
- [ ] T004 [P] Crear `firmware/pinger/src/board_xiao.h` con los pines de research R-4
- [ ] T005 [P] Añadir `.github/workflows/firmware.yml`: `pio test -e native`, `pio run -e xiao_nrf52` y un guard `! grep -R "Arduino.h" firmware/pinger/lib/tracecore`

---

## Phase 2: Foundational (bloquea todas las historias)

- [ ] T006 [P] Test `firmware/pinger/test/test_airtime/test_airtime.cpp`: ToA para los 4 presets de R-3 (±1 ms) y `timeoutAuto()` (960/1658/1207/2090 ms)
- [ ] T007 [P] Test `firmware/pinger/test/test_config/test_config.cpp`: rangos de `validate()`, `preamble()` y roundtrip `serialize/deserialize` con CRC; si el CRC está corrupto → `nullopt`
- [ ] T008 [P] Implementar `lib/tracecore/{include/tracecore/Airtime.h,src/Airtime.cpp}` (fórmula Semtech, LDRO automático)
- [ ] T009 [P] Implementar `lib/tracecore/{include/tracecore/Config.h,src/Config.cpp}` (RadioConfig, PingerConfig, validate, serialize con `'YPNG'|v1|crc16`). Defaults: 915.800 / 250 / 10 / 5, `txp=22`, `rate=1500`
- [ ] T010 Implementar `src/RadioShell.{h,cpp}`: `begin(RadioConfig)`, `reconfigure()`, `transmit(bytes)`, `startReceive()`, `scanChannel()`, ISR DIO1 → bandera, `readPacket(buf, &rssi, &snr)`. Sync `0x12`, CRC on, header explícito, preámbulo de `cfg.preamble()`, TCXO 1.8 V, DIO2 RF switch, `setRxBoostedGainMode(true)`
- [ ] T011 [P] Implementar `src/SerialTransport.{h,cpp}`: lectura no bloqueante hasta `\n` (máx. 160 B; si se excede, descartar y emitir `!ERR syntax`); `writeLine()` atómica

**Checkpoint**: `pio test -e native` verde y el firmware compila con un `loop()` vacío que inicializa la radio y responde `#HELLO`.

---

## Phase 3: User Story 1 — Ping único (P1) 🎯 MVP

**Goal**: `SET hash`, `PING` → `P,…ok…` o `timeout`

**Independent Test**: quickstart, sección "Primer ping"

### Tests (escribir primero, deben fallar)

- [ ] T012 [P] [US1] `test/test_trace_frame/test_trace_frame.cpp`:
  - `build(tag=0x78563412,H=0xA1)` == `26 00 12 34 56 78 00 00 00 00 00 A1`
  - `parseEcho` acepta `26 01 E7 12 34 56 78 00 00 00 00 00 A1` → `snr_up_q=-25`
  - `parseEcho` rechaza: header ≠ 0x26, `path_len` ≠ 1, longitud ≠ 13, flags ≠ 0, hash distinto
  - `snr_up_q` en los extremos `0x80` (−32.00) y `0x7F` (+31.75)
- [ ] T013 [P] [US1] `test/test_line_codec/test_line_codec.cpp`: formateo de `P` (ok y timeout), signo explícito y 2 decimales; parseo de `HELLO`, `CFG?`, `SET k=v`, `PING`, `PING n`; los errores `syntax`/`unknown`/`range` se generan contra `test/fixtures/lines/commands.txt` y `events_p.txt`
- [ ] T014 [P] [US1] `test/test_pinger_fsm/test_ping_single.cpp` con `FakeRng` y `CapturingSink`:
  - `PING` sin hash → `!ERR state nohash`
  - `PING` → `Action::Transmit` con los bytes del contrato; `onTxDone` → `StartRx`
  - `onRx(eco válido)` y luego `tick(deadline)` → `P,1,…,ok,<rtt>,…,1`, con `rtt = t_rx − t_tx_done`
  - `tick(deadline)` sin eco → `P,…,timeout,,,,,0`
  - eco con otro tag → ignorado
  - dos pings seguidos → tags distintos aunque el RNG repita (reintento)
  - `onChannelBusy` ×3 → `P,…,busy,…`; entre intentos `tick()` reprograma `Transmit` tras un backoff múltiplo de 120 ms (120–480)

### Implementación

- [ ] T015 [P] [US1] `lib/tracecore/{include/tracecore/TraceFrame.h,src/TraceFrame.cpp}`: `build()` y `parseEcho()` según `contracts/trace-frame.md`
- [ ] T016 [P] [US1] `lib/tracecore/{include/tracecore/LineCodec.h,src/LineCodec.cpp}`: formateadores `P/#/!` y parser de comandos (sin `std::string` en el camino caliente; buffers fijos)
- [ ] T017 [US1] `lib/tracecore/{include/tracecore/Pinger.h,src/Pinger.cpp}`: estados `IDLE/TX/RX_WAIT/REPORT`, `onCommand(PING|SET hash|HELLO|CFG?)`, deadline con `timeoutAuto()`, aritmética de 32 bits sin signo, reintentos CAD con backoff, cadencia `max(inicio+rate, reporte)` (depende de T015, T016)
- [ ] T018 [US1] `src/main.cpp`: cablea `SerialTransport` → `Pinger::onCommand`, bandera DIO1 → `onTxDone`/`onRx`, `tick(millis())`, ejecuta la `Action`. Implementa `Rng` con el TRNG del nRF52
- [ ] T019 [US1] Prueba de banco: 20 × `PING` contra el repetidor real con omni. Registrar el resultado en `specs/001-trace-pinger-firmware/bench-log.md` (SC-001, SC-002)

**Checkpoint**: MVP utilizable desde un terminal serie.

---

## Phase 4: User Story 2 — Ráfagas, GO/STOP, estadísticas (P2)

### Tests

- [ ] T020 [P] [US2] `test/test_stats/test_stats.cpp`: mediana con n impar, n par (promedio de los centrales), n=1 y vacía
- [ ] T021 [P] [US2] `test/test_duty_limiter/test_duty_limiter.cpp`: ventana de 60 s, 10 %, `canTransmit(now, dur)`, `nextAllowed()`; con ToA de 132 ms se permiten 45 TX por minuto, la 46.ª espera
- [ ] T022 [P] [US2] `test/test_pinger_fsm/test_burst.cpp`: `PING 5` → 5 `P` con separación ≥ rate y luego `S` correcto; `STOP` a mitad; `GO` con `STOP`; `SET rate=200` → `!ERR range`; `PING 51` → `!ERR range`; duty agotado → `#WARN duty_wait <ms>` y el ping se difiere; `S,` lleva el campo final `busy` y `loss%` excluye `busy`/`txerr`; `STOP` a mitad de ráfaga emite `S,` con lo realizado; `SET freq` con ping pendiente → `!ERR state busy`; `GO` en `MON` → `!ERR state mon`

### Implementación

- [ ] T023 [P] [US2] `lib/tracecore/{include/tracecore/Stats.h,src/Stats.cpp}`
- [ ] T024 [P] [US2] `lib/tracecore/{include/tracecore/DutyLimiter.h,src/DutyLimiter.cpp}` (anillo de 64)
- [ ] T025 [US2] Extender `Pinger`: estado `DUTY_WAIT`, comandos `PING n`/`GO`/`STOP`, `S,` al terminar la ráfaga
- [ ] T026 [US2] `firmware/pinger/tools/pinger_cli.py`: `--burst`, `--repeat`, `--csv`; calcula SC-001…SC-004

---

## Phase 5: User Story 3 — Monitor y captura cruda (P2)

### Tests

- [ ] T027 [P] [US3] `test/test_pinger_fsm/test_monitor.cpp`: `MON on` → todo `onRx` emite `R,`; `PING` en MON → `!ERR state mon`; `raw=1` emite `R,` además de `P,`; dos ecos con el mismo tag → `n_resp=2` + `#WARN hash_collision`; eco tardío con `raw=1` → solo `R,`
- [ ] T028 [P] [US3] Ampliar `test_line_codec`: formato `R,` (hex en mayúsculas; máx. 64 B de trama → la línea no supera 160 B; si es mayor, se trunca a 64 B y se añade el sufijo ASCII `..`)

### Implementación

- [ ] T029 [US3] `Pinger`: estado `MON`, `raw`, conteo de ecos durante toda la ventana (FR-015)
- [ ] T030 [US3] Campo: capturar ≥ 10 ecos y ≥ 2 adverts reales con `raw=1`/`MON`. Guardarlos en `firmware/pinger/test/fixtures/frames/field-<fecha>.txt` (entrada de la fase 002)

---

## Phase 6: User Story 4 — Configuración persistente (P3)

- [ ] T031 [P] [US4] Test en `test_pinger_fsm/test_config_cmds.cpp`: `SET` de cada clave (válido e inválido), `CFG?` refleja los cambios, `SET freq` → `Action::Reconfigure`
- [ ] T032 [US4] `src/ConfigStore.{h,cpp}` sobre `InternalFileSystem`: `load()` → `PingerConfig` o defaults con `#WARN cfg_reset`; `save()`
- [ ] T033 [US4] `Pinger`: `SAVE`, `SET` completo; `main.cpp` emite `#HELLO` y `#CFG` al arrancar

---

## Phase 7: Polish

- [ ] T034 [P] `firmware/pinger/README.md` (resumen del quickstart y tabla de comandos)
- [ ] T035 Auditoría FR-008: confirmar que `RadioShell::transmit` solo se llama desde la ruta `Action::Transmit` y que el `Pinger` solo produce bytes con `TraceFrame::build`. Añadir un `assert(bytes[0]==0x26)` en `transmit()`
- [ ] T036 Prueba de 1 h con un segundo nodo en `MON` (SC-005) → `bench-log.md`

---

## Dependencies & Execution Order

- Spike (S001–S003) → Setup (T001–T005) → Foundational (T006–T011) → US1 (T012–T019).
- US2, US3 y US4 dependen de US1 (comparten `Pinger`). Entre ellas pueden ir en paralelo si se coordinan los cambios a `Pinger.cpp`; en la práctica conviene hacerlas en serie: US2 → US3 → US4.
- T030 (fixtures de campo) desbloquea la fase 002/US3.

### Parallel Example: US1

```bash
# en paralelo (archivos distintos):
T012 test_trace_frame   T013 test_line_codec   T014 test_ping_single
# luego en paralelo:
T015 TraceFrame         T016 LineCodec
# después, en serie:
T017 Pinger → T018 main.cpp → T019 banco
```

## Trazabilidad FR → tareas

| FR | Tareas |
|---|---|
| FR-001 | T012, T015 |
| FR-002 | T014, T018 |
| FR-003 | T009, T010 |
| FR-004 | T012, T014, T015, T017 |
| FR-005 | T012, T015 |
| FR-006 | T006, T008, T017 |
| FR-007 | T021, T022, T024, T025 |
| FR-008 | T035, T036 |
| FR-009 | T011, T013, T016, T018 |
| FR-010 | T020, T022, T023, T025 |
| FR-011 | T027, T029 |
| FR-012 | T007, T032 |
| FR-013 | T009 |
| FR-014 | T005, T003 |
| FR-015 | T027, T029 |
| FR-016 | T014, T031, T033 |

## Implementation Strategy

MVP = Phases 1–3. En cuanto el banco (T019) da `ok` contra el repetidor real, la técnica queda validada y el resto es ergonomía.
