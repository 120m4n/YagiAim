# Research: 002 Verificación en host

## R-1 ¿Compilar `Mesh.cpp` real o modelarlo?

**Decision**: Modelar el bloque TRACE en `RepeaterModel` y atarlo a upstream con el guardián de deriva (W1–W10).

**Rationale**: `Mesh.cpp` depende de `Dispatcher`, `Identity` (ed25519), `RNG`, `RTCClock`, `MeshTables` y `PacketManager`. Upstream no lo compila en `env:native`: sus tests usan `test/mocks/Mesh.h`, que es un stub. Montar todo eso equivale a "montar el core", justo lo que se quiere evitar. El modelo ocupa unas 40 líneas, es legible, y el guardián garantiza que no se desincroniza.

**Alternatives considered**:
- *Compilar `Mesh.cpp` con stubs de todas sus dependencias*: unas 500 líneas de stubs frágiles que se rompen con cada refactor upstream.
- *Repetidor real en un segundo XIAO como "test de integración HIL"*: valioso, pero es un test de campo y no corre en CI. Queda cubierto por US3 (fixtures) y por el banco de la 001.

## R-2 Reutilizar el `env:native` de upstream

**Decision**: Replicar su configuración en `firmware/pinger/platformio.ini`:

```ini
[env:native]
platform = native
test_framework = googletest
build_flags = -std=c++17
  -I ../../third_party/MeshCore/src
  -I ../../third_party/MeshCore/test/mocks
  -I lib/tracecore/include
  -I test/support
test_build_src = yes
build_src_filter = -<*>
  +<../../../third_party/MeshCore/src/Packet.cpp>
  +<../test/support/*.cpp>
lib_deps = google/googletest @ 1.17.0
```

**Rationale**: Upstream ya demuestra que `Packet.cpp` compila con esos mocks (`SHA256.h` determinista). `tracecore` entra como librería local (`lib/`) y PlatformIO la enlaza sola. **Riesgo**: las rutas relativas de `build_src_filter` fuera de `src_dir` son delicadas en PlatformIO. Plan B: script `extra_scripts` que añade `Packet.cpp` con `env.BuildSources()`.

## R-3 Guardián: Python vs. gtest

**Decision**: Un script Python (`tools/check_upstream_trace.py`, solo stdlib) como fuente de verdad, invocado:
1. en CI como paso independiente;
2. desde un test gtest (`test_upstream_guard`) con `std::system()`, para que `pio test` también lo ejecute.

Si `python3` no está disponible, el test se salta con `GTEST_SKIP` y lo indica en el mensaje.

**Rationale**: Extraer y normalizar texto es trivial en Python y engorroso en C++. Ejecutarlo desde gtest evita que se olvide localmente.

## R-4 Tests de propiedad sin dependencias

**Decision**: Bucles con `std::mt19937` y semilla fija (`0x59414749`, "YAGI"), imprimiendo semilla e iteración al fallar. No se añade RapidCheck (Constitución VI).

## R-5 Test de mutación del guardián (SC-002)

**Decision**: `test_upstream_guard` copia el archivo vigilado a un temporal, cambia un carácter dentro de W1 y ejecuta el script con `--root <tmp>`, que debe salir ≠ 0. Además se cambia una línea fuera de los fragmentos, lo que debe salir 0. Así se prueba que el guardián detecta lo que debe y nada más.
