# Research: 002 Verificación en host

## R-1 ¿Compilar `Mesh.cpp` real o modelarlo?

**Decision**: Modelar el bloque TRACE en `RepeaterModel` y atarlo a upstream con el guardián de deriva (W1–W10).

**Rationale**: `Mesh.cpp` depende de `Dispatcher`, `Identity` (ed25519), `RNG`, `RTCClock`, `MeshTables` y `PacketManager`. Upstream no lo compila en `env:native`: sus tests usan `test/mocks/Mesh.h`, que es un stub. Montar todo eso equivale a "montar el core", justo lo que se quiere evitar. El modelo ocupa unas 40 líneas, es legible, y el guardián garantiza que no se desincroniza.

**Alternatives considered**:
- *Compilar `Mesh.cpp` con stubs de todas sus dependencias*: unas 500 líneas de stubs frágiles que se rompen con cada refactor upstream.
- *Repetidor real en un segundo XIAO como "test de integración HIL"*: valioso, pero es un test de campo y no corre en CI. Queda cubierto por US3 (fixtures) y por el banco de la 001.

## R-2 Compilar `Packet.cpp` real en host

**Decision**: `run_tests.sh` compila una vez `src/Packet.cpp` y `src/Utils.cpp` de la raíz de Meshcore (`../..` desde `examples/trace_pinger`) con los mocks de `test/mocks`, y enlaza ese objeto con cada suite:

```sh
c++ -std=c++17 -I src -I test/mocks -I examples/trace_pinger/tracecore/include \
    -I examples/trace_pinger/tests/shim -I examples/trace_pinger/tests/support \
    <suite>/*.cpp tracecore/src/*.cpp <core.o>
```

**Rationale**: El `[env:native]` del repo ya compila `Packet.cpp` con esos mocks, pero ampliarlo exige tocar el `platformio.ini` raíz, y la regla es no modificar nada fuera de `examples/trace_pinger/` salvo el env del pinger. **Riesgo cerrado** (2026-10-14): un prototipo compiló `Packet.cpp` + `Utils.cpp` + `TraceFrame.cpp` en host y comprobó `readFrom` de la petición, identidad de bytes con `writeTo`, `parseEcho` del eco con SNR −6.3 → −25 e `isValidPathLen(0xC1)==false`.

## R-3 Guardián: Python vs. gtest

**Decision**: Un script Python (`tools/check_upstream_trace.py`, solo stdlib) como fuente de verdad, invocado:
1. a mano (`python3 tools/check_upstream_trace.py`);
2. desde un test (`test_upstream_guard`) con `std::system()`, para que `run_tests.sh` también lo ejecute. El paso de CI queda diferido (T017).

Si `python3` no está disponible, el test se salta con `GTEST_SKIP` y lo indica en el mensaje.

**Rationale**: Extraer y normalizar texto es trivial en Python y engorroso en C++. Ejecutarlo desde gtest evita que se olvide localmente.

## R-4 Tests de propiedad sin dependencias

**Decision**: Bucles con `std::mt19937` y semilla fija (`0x59414749`, "YAGI"), imprimiendo semilla e iteración al fallar. No se añade RapidCheck (Constitución VI).

## R-5 Test de mutación del guardián (SC-002)

**Decision**: `test_upstream_guard` copia el archivo vigilado a un temporal, cambia un carácter dentro de W1 y ejecuta el script con `--root <tmp>`, que debe salir ≠ 0. Además se cambia una línea fuera de los fragmentos, lo que debe salir 0. Así se prueba que el guardián detecta lo que debe y nada más.
