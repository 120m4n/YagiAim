# Implementation Plan: Verificación en host de la trama TRACE

**Branch**: `002-trace-frame-host-tests` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-trace-frame-host-tests/spec.md`

## Summary

Suite gtest en `env:native` que enlaza `Packet.cpp` real de MeshCore (submódulo fijado) con `tracecore`, más:
- un `RepeaterModel` que reproduce la decisión TRACE de `Mesh.cpp`;
- un guardián Python que falla si cambian los fragmentos upstream de los que dependemos;
- tests dirigidos por fixtures de campo y de líneas.

## Technical Context

**Language/Version**: C++17 (g++ ≥ 11 o clang ≥ 14), Python 3.10+ (solo stdlib)

**Primary Dependencies**: GoogleTest 1.17 (vía PlatformIO); `third_party/MeshCore@a366955` (`src/Packet.cpp`, `test/mocks/*`)

**Storage**: archivos de fixtures y lock JSON en `firmware/pinger/test/`

**Testing**: `pio test -e native`; `python3 firmware/pinger/tools/check_upstream_trace.py`

**Target Platform**: Linux/macOS (desarrollo y CI con GitHub Actions `ubuntu-latest`)

**Project Type**: suite de tests y tooling

**Performance Goals**: suite < 10 s

**Constraints**: sin dependencias nuevas fuera de gtest; no modificar el submódulo

**Scale/Scope**: unos 6 archivos de test, 1 modelo, 1 script, 2 directorios de fixtures

## Constitution Check

| Principio | Cumple | Cómo |
|---|---|---|
| I. Compatibilidad verificada | ✅ | Es el objetivo de la feature: parser real + guardián |
| II. Buen ciudadano | ✅ | US2-AS3 prueba que el eco no se propaga; US2-AS4 que el tag repetido se descarta |
| III. Núcleo puro | ✅ | Compilar `tracecore` en host junto a `Packet.cpp` es la prueba de pureza |
| IV. Protocolo único | ✅ | US4: fixtures de líneas compartidos |
| V. Test-first | ✅ | La feature es de tests; los de interoperabilidad pueden ir antes que T015/T016 de la 001 |
| VI. Simplicidad | ✅ | Sin libs nuevas: mini-parser JSON propio de unas 80 líneas, justificado frente a añadir nlohmann/json (≈ 25 k líneas) |

## Project Structure

### Documentation (this feature)

```text
specs/002-trace-frame-host-tests/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/
│   ├── upstream-watch.md
│   └── fixture-format.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
firmware/pinger/
├── platformio.ini                       # env:native ampliado (R-2)
├── tools/check_upstream_trace.py        # guardián (W1–W10)
└── test/
    ├── upstream-trace.lock
    ├── support/
    │   ├── RepeaterModel.{h,cpp}
    │   ├── Fixtures.{h,cpp}             # lectura <hex>\t<json>
    │   └── Hex.{h,cpp}
    ├── fixtures/
    │   ├── frames/{synthetic.txt, spike-kiss-*.txt, field-*.txt}
    │   └── lines/{commands.txt, events_p.txt, events_s.txt, events_r.txt, info.txt}
    ├── test_interop_packet/             # US1
    ├── test_repeater_model/             # US2
    ├── test_upstream_guard/             # US2 (guardián + mutación)
    ├── test_field_frames/               # US3
    └── test_line_fixtures/              # US4
.github/workflows/firmware.yml           # + paso del guardián
```

**Structure Decision**: Todo dentro del proyecto PlatformIO del pinger. Un solo `pio test -e native` corre los tests unitarios de la 001 y los de interoperabilidad de esta fase.

## Complexity Tracking

| Violación | Por qué | Alternativa más simple rechazada porque |
|---|---|---|
| `RepeaterModel` duplica lógica upstream | `Mesh.cpp` no compila en host sin el core | Compilarlo con stubs = "montar el core" (R-1). La duplicación queda neutralizada por el guardián W1 |
