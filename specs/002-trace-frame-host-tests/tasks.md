---

description: "Task list for 002-trace-frame-host-tests"
---

# Tasks: Verificación en host de la trama TRACE

**Input**: Design documents from `/specs/002-trace-frame-host-tests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/. De la fase 001: T001–T003 (submódulo, platformio.ini, árbol de tracecore). Los headers de `TraceFrame`/`LineCodec` pueden existir solo como declaraciones: los tests de esta fase sirven de *red tests* para T015/T016.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Ampliar `env:native` en `firmware/pinger/platformio.ini` según research R-2 (`Packet.cpp` upstream, mocks, `test/support`)
- [ ] T002 Validar el riesgo de R-2 con un test trivial `test/test_interop_packet/test_smoke.cpp` que construye `mesh::Packet` y llama `readFrom`. Si la ruta relativa falla, usar el plan B con `extra_scripts/add_upstream.py` (`env.BuildSources`)
- [ ] T003 [P] Mensaje claro si falta el submódulo: `extra_scripts/check_submodule.py` hace `Exit(1)` con `git submodule update --init third_party/MeshCore`

## Phase 2: Foundational

- [ ] T004 [P] `test/support/Hex.{h,cpp}`: `fromHex`/`toHex` (mayúsculas), con tests inline en `test_interop_packet`
- [ ] T005 [P] `test/support/Fixtures.{h,cpp}`: lector `<payload>\t<json>`, que ignora `#` y líneas vacías; mini-parser JSON plano; error si una línea no tiene JSON (US3-AS3)
- [ ] T006 [P] `test/fixtures/frames/synthetic.txt`: ejemplos del contrato de la 001 (petición, eco −25, rechazos de cada regla)

**Checkpoint**: `pio test -e native -f test_interop_packet` compila y el smoke test pasa.

---

## Phase 3: User Story 1 — Interop con el parser upstream (P1) 🎯 MVP

- [ ] T007 [P] [US1] `test/test_interop_packet/test_build_vs_readfrom.cpp`: 10 000 `(tag,H)` con semilla `0x59414749` → `readFrom` y aserciones de US1-AS1
- [ ] T008 [P] [US1] `test/test_interop_packet/test_writeto_vs_parseecho.cpp`: q ∈ [−128,127] × 16 hashes → `writeTo` → `parseEcho` (US1-AS2)
- [ ] T009 [P] [US1] `test/test_interop_packet/test_byte_identity.cpp`: `build()` == `writeTo()` del `Packet` armado con la API upstream (US1-AS3)
- [ ] T010 [P] [US1] `test/test_interop_packet/test_rejections.cpp`: cada regla de rechazo, cruzada con `readFrom` cuando aplica, incluido `path_len=0xC1` (hash size 4 → `isValidPathLen` false) (US1-AS4)
- [ ] T011 [US1] Iterar `tracecore::TraceFrame` (fase 001 T015) hasta que T007–T010 pasen

---

## Phase 4: User Story 2 — RepeaterModel y guardián (P1)

### Modelo

- [ ] T012 [P] [US2] `test/test_repeater_model/test_repeater_model.cpp`: US2-AS1…AS5 (reenvío, no-match, eco final, dedupe por tag, ida y vuelta completa con `parseEcho`). Incluye `snr=-6.3` → `q=-25` (truncamiento) y `disable_fwd=true` → `Release`
- [ ] T013 [US2] `test/support/RepeaterModel.{h,cpp}` según data-model, citando el origen (FR-003)

### Guardián

- [ ] T014 [P] [US2] `tools/check_upstream_trace.py`: anclas W1–W10 de `contracts/upstream-watch.md`, normalización, `--root`, `--lock`, `--update`; diff unificado por `stderr`; códigos de salida 0/1/2 (2 = ancla no encontrada)
- [ ] T015 [US2] Generar `test/upstream-trace.lock` con `--update` sobre `a366955` y commitearlo
- [ ] T016 [US2] `test/test_upstream_guard/test_upstream_guard.cpp`: (a) el script sale 0 sobre el submódulo; (b) mutación dentro de W1 en una copia temporal → ≠ 0; (c) mutación fuera de los fragmentos → 0; (d) ancla borrada → 2; `GTEST_SKIP` si no hay `python3` (research R-5)
- [ ] T017 [US2] Paso `python3 firmware/pinger/tools/check_upstream_trace.py` en `.github/workflows/firmware.yml`

---

## Phase 5: User Story 3 — Capturas de campo (P2)

- [ ] T018 [P] [US3] `test/test_field_frames/test_field_frames.cpp`: recorre `fixtures/frames/*.txt` y aplica las aserciones por `kind` (`contracts/fixture-format.md`)
- [ ] T019 [US3] Importar las capturas del spike KISS (001/S003) y del campo (001/T030), anotadas
- [ ] T020 [US3] Si una captura real contradice el contrato: abrir un issue, ajustar el contrato y `TraceFrame`, y dejar el fixture como regresión

---

## Phase 6: User Story 4 — Paridad de codec de líneas (P3)

- [ ] T021 [P] [US4] `test/fixtures/lines/{commands,events_p,events_s,events_r,info}.txt` cubriendo todos los ejemplos de `001/contracts/line-protocol.md` y todos los `!ERR`
- [ ] T022 [US4] `test/test_line_fixtures/test_line_fixtures.cpp`: JSON → struct → `LineCodec::format*` == línea; comando → resultado esperado

---

## Phase 7: Polish

- [ ] T023 Medir la suite (`time pio test -e native`) < 10 s (SC-003); si no se cumple, reducir iteraciones de propiedad en local con `-DPROP_ITERS`
- [ ] T024 [P] Sección "Tests y compatibilidad" en `firmware/pinger/README.md`

## Dependencies & Execution Order

- T001–T003 → T004–T006 → US1 y US2 en paralelo (archivos distintos) → US3 (necesita capturas) → US4.
- T011 depende de la fase 001 T015 (se itera hasta verde).
- T019 depende de 001/S003 y 001/T030.

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
