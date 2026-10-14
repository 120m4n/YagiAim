---

description: "Task list for 002-trace-frame-host-tests"
---

# Tasks: Verificación en host de la trama TRACE

**Input**: Design documents from `/specs/002-trace-frame-host-tests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/. La fase 001 está implementada (Meshcore `0b85c69e`): `tracecore` ya existe en `examples/trace_pinger/tracecore/` y el prototipo de US1 ya pasa. Los tests de esta fase se añaden encima.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Ampliar `examples/trace_pinger/run_tests.sh` según research R-2: compilar una vez `src/Packet.cpp` y `src/Utils.cpp` (con `-I src -I test/mocks`) y enlazarlos con cada suite; aceptar filtros (`./run_tests.sh test_interop_packet …`); abortar con `not inside the Meshcore repo: src/Packet.cpp missing` si falta el core
- [x] T002 Test trivial `tests/test_interop_packet/test_smoke.cpp`: construye `mesh::Packet` con la API upstream y llama `readFrom` (el prototipo del 2026-10-14 ya lo demostró; este test lo deja como regresión)
- [x] T003 [P] Añadir `GTEST_SKIP()` al shim `tests/shim/gtest/gtest.h` (lo usa T016 si no hay `python3`)

## Phase 2: Foundational

- [ ] T004 [P] `tests/support/Hex.{h,cpp}`: `fromHex`/`toHex` (mayúsculas), con tests inline en `test_interop_packet`
- [ ] T005 [P] `tests/support/Fixtures.{h,cpp}`: lector `<payload>\t<json>`, que ignora `#` y líneas vacías; mini-parser JSON plano; error si una línea no tiene JSON (US3-AS3)
- [ ] T006 [P] `tests/fixtures/frames/synthetic.txt`: ejemplos del contrato de la 001 (petición, eco −25, rechazos de cada regla)

**Checkpoint**: `./examples/trace_pinger/run_tests.sh test_interop_packet` compila y el smoke test pasa.

---

## Phase 3: User Story 1 — Interop con el parser upstream (P1) 🎯 MVP

- [x] T007 [P] [US1] `tests/test_interop_packet/test_build_vs_readfrom.cpp`: 10 000 `(tag,H)` con semilla `0x59414749` → `readFrom` y aserciones de US1-AS1
- [x] T008 [P] [US1] `tests/test_interop_packet/test_writeto_vs_parseecho.cpp`: q ∈ [−128,127] × 16 hashes → `writeTo` → `parseEcho` (US1-AS2)
- [x] T009 [P] [US1] `tests/test_interop_packet/test_byte_identity.cpp`: `build()` == `writeTo()` del `Packet` armado con la API upstream (US1-AS3)
- [x] T010 [P] [US1] `tests/test_interop_packet/test_rejections.cpp`: cada regla de rechazo, cruzada con `readFrom` cuando aplica, incluido `path_len=0xC1` (hash size 4 → `isValidPathLen` false) (US1-AS4)
- [x] T011 [US1] Corregir `buildRequest`/`parseEcho` (`tracecore/src/TraceFrame.cpp`) solo si T007–T010 fallan (el prototipo indica que ya pasan)

---

## Phase 4: User Story 2 — RepeaterModel y guardián (P1)

### Modelo

- [ ] T012 [P] [US2] `tests/test_repeater_model/test_repeater_model.cpp`: US2-AS1…AS5 (reenvío, no-match, eco final, dedupe por tag, ida y vuelta completa con `parseEcho`). Incluye `snr=-6.3` → `q=-25` (truncamiento) y `disable_fwd=true` → `Release`
- [ ] T013 [US2] `tests/support/RepeaterModel.{h,cpp}` según data-model, citando el origen (FR-003)

### Guardián

- [ ] T014 [P] [US2] `tools/check_upstream_trace.py`: anclas W1–W10 de `contracts/upstream-watch.md`, normalización, `--root`, `--lock`, `--update`; diff unificado por `stderr`; códigos de salida 0/1/2 (2 = ancla no encontrada)
- [ ] T015 [US2] Generar `tests/upstream-trace.lock` con `--update` sobre `362ea302` y commitearlo
- [ ] T016 [US2] `tests/test_upstream_guard/test_upstream_guard.cpp`: (a) el script sale 0 sobre el core actual; (b) mutación dentro de W1 en una copia temporal → ≠ 0; (c) mutación fuera de los fragmentos → 0; (d) ancla borrada → 2; `GTEST_SKIP` si no hay `python3` (research R-5)
- [ ] T017 [US2] **DIFERIDO**: paso del guardián en CI. Añadir un workflow al fork toca archivos fuera de `examples/trace_pinger/`; mientras tanto el guardián corre desde `run_tests.sh` (T016)

---

## Phase 5: User Story 3 — Capturas de campo (P2)

- [ ] T018 [P] [US3] `tests/test_field_frames/test_field_frames.cpp`: recorre `fixtures/frames/*.txt` y aplica las aserciones por `kind` (`contracts/fixture-format.md`)
- [ ] T019 [US3] Capturar con el XIAO flasheado (`SET raw=1` + `PING` para ecos, `MON on` para otros tipos): ≥ 10 ecos y ≥ 2 tramas de otros tipos, anotadas en `tests/fixtures/frames/field-<fecha>.txt` (el spike KISS ya no hace falta). Requiere el XIAO conectado
- [ ] T020 [US3] Si una captura real contradice el contrato: abrir un issue, ajustar el contrato y `TraceFrame`, y dejar el fixture como regresión

---

## Phase 6: User Story 4 — Paridad de codec de líneas (P3)

- [ ] T021 [P] [US4] `tests/fixtures/lines/{commands,events_p,events_s,events_r,info}.txt` cubriendo todos los ejemplos de `001/contracts/line-protocol.md` y todos los `!ERR`
- [ ] T022 [US4] `tests/test_line_fixtures/test_line_fixtures.cpp`: JSON → struct → `LineCodec::format*` == línea; comando → resultado esperado

---

## Phase 7: Polish

- [ ] T023 Medir la suite (`time ./examples/trace_pinger/run_tests.sh`) < 10 s (SC-003); si no se cumple, reducir iteraciones de propiedad en local con `-DPROP_ITERS`
- [ ] T024 [P] Sección "Tests y compatibilidad" en `examples/trace_pinger/README.md`

## Dependencies & Execution Order

- T001–T003 → T004–T006 → US1 y US2 en paralelo (archivos distintos) → US3 (necesita capturas) → US4.
- T011 solo actúa si T007–T010 fallan.
- T019 requiere el XIAO conectado y un repetidor a la vista.

## Trazabilidad FR → tareas

| FR | Tareas |
|---|---|
| FR-001 | T001, T002, T003 |
| FR-002 | T012, T013 |
| FR-003 | T013 |
| FR-004 | T014, T015 |
| FR-005 | T016, T017 |
| FR-006 | T007, T008 |
| FR-007 | T005, T018, T021 |
| FR-008 | T023 |
