# Feature Specification: Verificación en host de la trama TRACE contra MeshCore upstream

**Feature Branch**: `002-trace-frame-host-tests`

**Created**: 2026-10-13

**Status**: Ready for planning (revisada 2026-10-14)

**Input**: User description: "Prueba unitaria del armado/parseo de la trama contra `Packet::readFrom` (en host, con el código de MeshCore)."

## Contexto

La fase 001 prueba `tracecore` contra los bytes del contrato, pero ese contrato lo escribió el equipo. Esta fase cierra el círculo (Constitución I) en tres pasos:
- Compila el código **real** de MeshCore (`Packet.cpp`) junto con `tracecore` en host.
- Modela la decisión de reenvío del repetidor y vigila que no cambie en upstream.
- Reproduce las tramas capturadas en campo.

**Ubicación**: el código vive en `Meshcore/examples/trace_pinger/` (fase 001, commit `0b85c69e`). El core está en el mismo repo, así que las rutas upstream (`src/Packet.cpp`, `test/mocks`, `src/Mesh.cpp`) son relativas a la raíz de Meshcore y no hay submódulo. Las pruebas corren con `examples/trace_pinger/run_tests.sh` (g++ y un gtest mínimo incluido), porque no se modifica el `env:native` del repo. Un prototipo del 2026-10-14 ya demostró que `readFrom`, `writeTo` y `parseEcho` interoperan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interoperabilidad con el parser upstream (Priority: P1) 🎯 MVP

Como desarrollador, al correr `run_tests.sh` quiero saber que toda trama que construye `tracecore::buildRequest` es aceptada por `mesh::Packet::readFrom` con los campos esperados, y que toda trama que `mesh::Packet::writeTo` produce para un eco la entiende `tracecore::parseEcho`.

**Why this priority**: Es la garantía central. Si falla, el pinger habla un dialecto que la mesh no entiende.

**Independent Test**: Un solo binario gtest enlaza `src/Packet.cpp` + `tracecore`. Pasa con todos los casos de abajo.

**Acceptance Scenarios**:

1. **Given** `buildRequest(tag, H)` para 10 000 pares aleatorios con semilla fija, **When** se pasa a `Packet::readFrom`, **Then** devuelve `true`, `getRouteType()==ROUTE_TYPE_DIRECT`, `getPayloadType()==PAYLOAD_TYPE_TRACE`, `getPayloadVer()==0`, `getPathHashCount()==0`, `payload_len==10`, `memcmp(payload, tag‖auth‖flags‖H)==0`.
2. **Given** un `mesh::Packet` armado con la API upstream (`header`, `setPathHashSizeAndCount(1,1)`, `path[0]=q`, payload), **When** se serializa con `writeTo` y se pasa a `parseEcho`, **Then** se obtiene `snr_up_q == q` para todo `q ∈ [−128, 127]`.
3. **Given** `buildRequest()`, **When** se compara con `writeTo()` de un `mesh::Packet` equivalente armado a mano con la API upstream, **Then** los bytes son idénticos.
4. **Given** las tramas inválidas del contrato (header ≠ 0x26, `path_len` ≠ 1, longitud ≠ 13, flags ≠ 0, hash ≠ H, `path_len` con hash size 4), **When** se evalúan, **Then** `parseEcho` las rechaza. Cuando `readFrom` también las rechaza, ambos coinciden.

---

### User Story 2 - Modelo del repetidor y guardián de deriva (Priority: P1)

Quiero un modelo ejecutable de la decisión TRACE del repetidor (`Mesh.cpp` L42–65), probado contra las tramas de `tracecore`. Además, quiero que un test falle **automáticamente** si ese bloque o las constantes relevantes cambian en upstream, de modo que traer cambios de upstream (merge o rebase del fork) nunca rompa la compatibilidad en silencio.

**Why this priority**: `Mesh.cpp` no se puede compilar en host sin arrastrar Dispatcher, Identity/ed25519 y las tablas (research R-2). El modelo es necesario, y solo es fiable si está atado al código real.

**Independent Test**: `python3 examples/trace_pinger/tools/check_upstream_trace.py` sale con 0 con el core actual. Al modificar a propósito una línea del bloque en una copia de prueba, sale con ≠ 0 y muestra el diff.

**Acceptance Scenarios**:

1. **Given** la petición `buildRequest(tag, H)` deserializada con `readFrom` y un repetidor modelo con `pub_key[0]==H`, **When** se aplica `RepeaterModel::onRecv(pkt, snr)`, **Then** la acción es `Retransmit`, `path_len` pasa a 1 y `path[0]==int8(snr*4)`.
2. **Given** el mismo paquete y un repetidor con `pub_key[0]≠H`, **When** se aplica, **Then** la acción es `Release` (no reenvía).
3. **Given** el eco (path_len=1), **When** lo recibe cualquier repetidor modelo, **Then** la acción es `TraceComplete` (no reenvía): el eco no se propaga.
4. **Given** dos peticiones con el mismo tag, **When** pasan por el mismo repetidor modelo con tabla de vistos, **Then** la segunda es `Release`. Esto documenta la necesidad de FR-002 de la fase 001.
5. **Given** `RepeaterModel` aplicado y serializado con `writeTo`, **When** se pasa a `parseEcho`, **Then** se recupera el SNR inyectado (ida y vuelta completa: pinger → repetidor → pinger).
6. **Given** que upstream cambia `Mesh.cpp` dentro del bloque vigilado, o cualquiera de `PH_*`, `ROUTE_TYPE_DIRECT`, `PAYLOAD_TYPE_TRACE`, `MAX_PATH_SIZE` o `calculatePacketHash`, **When** corre el guardián, **Then** falla con el diff normalizado y la instrucción de actualizar el lock tras revisar.

---

### User Story 3 - Regresión con capturas de campo (Priority: P2)

Quiero que las tramas reales capturadas (spike KISS S003 y `MON`/`raw=1` de T030 de la fase 001) se reproduzcan en tests, para detectar cualquier diferencia entre lo que asumimos y lo que transmiten los repetidores desplegados.

**Why this priority**: Es la evidencia empírica de la Constitución V. Depende de tener capturas, por eso es P2.

**Independent Test**: Cada archivo de `tests/fixtures/frames/*.txt` se parsea. Los ecos se aceptan con el SNR anotado y las demás tramas pasan `readFrom` con el tipo anotado.

**Acceptance Scenarios**:

1. **Given** una línea de fixture `<hex>\t{"kind":"echo","tag":"…","hash":"A1","snr_up_q":-25}`, **When** se ejecuta el test, **Then** `parseEcho` devuelve esos valores y `readFrom` acepta la trama.
2. **Given** una línea `{"kind":"other","type":4}` (advert), **When** se ejecuta, **Then** `parseEcho` la rechaza y `readFrom` reporta `PAYLOAD_TYPE_ADVERT`.
3. **Given** un fixture nuevo sin anotación, **When** se ejecuta, **Then** el test falla con un mensaje que indica cómo anotarlo (no se aceptan fixtures sin expectativa).

---

### User Story 4 - Paridad del codec de líneas C++/Swift (Priority: P3)

Quiero un único conjunto de fixtures de líneas `proto=1` que validen tanto `tracecore::LineCodec` como el parser Swift de la fase 003.

**Why this priority**: Constitución IV. El consumidor Swift llega en la 003, pero los fixtures y el lado C++ se cierran aquí.

**Independent Test**: `test_line_fixtures` recorre `tests/fixtures/lines/*.txt`. Para cada línea de evento, el formato de `LineCodec` de la estructura esperada reproduce exactamente la línea.

**Acceptance Scenarios**:

1. **Given** `events_p.txt` con líneas `P,` y su JSON, **When** se parsea el JSON → `PingResult` → `tracecore::formatPing` (igual `formatSummary` para `S,` y `formatRaw` para `R,`), **Then** la salida es byte a byte igual a la línea.
2. **Given** `commands.txt` con comandos y el resultado esperado (`ok`/`!ERR code`), **When** se ejecutan contra un `Pinger` con `CapturingSink`, **Then** la línea emitida coincide.

### Edge Cases

- **`run_tests.sh` se ejecuta fuera del repo Meshcore** (falta `src/Packet.cpp` dos niveles arriba): aborta con `not inside the Meshcore repo: src/Packet.cpp missing`, no con errores de include.
- **Upstream cambia el mock `SHA256.h`**: los tests no dependen del valor del hash, solo de igualdad y desigualdad.
- **Upstream añade campos a `Packet`**: no afecta mientras `writeTo`/`readFrom` no cambien. Si cambian, el guardián lo detecta, porque `Packet.cpp` también está vigilado.
- **Diferencias de fin de línea o espacios en upstream**: el guardián normaliza (quita comentarios `//`, colapsa espacios) antes de comparar, para no fallar por formato.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `run_tests.sh` DEBE compilar `src/Packet.cpp` y `src/Utils.cpp` del core con los mocks de upstream (`test/mocks`) y enlazarlos con `tracecore` en los binarios de test.
- **FR-002**: DEBE existir `tracecore_test::RepeaterModel`, que reproduce el bloque TRACE de `Mesh.cpp` (L42–67 @ 362ea302) sobre `mesh::Packet`. Incluye `allowPacketForward` (configurable: `disable_fwd`) y una tabla de vistos basada en `calculatePacketHash` upstream.
- **FR-003**: El encabezado de `RepeaterModel` DEBE citar commit, archivo y líneas de origen.
- **FR-004**: `tools/check_upstream_trace.py` DEBE extraer los fragmentos vigilados (`contracts/upstream-watch.md`), normalizarlos, calcular SHA-256 y compararlo con `tests/upstream-trace.lock`. Sale con 1 y diff unificado si difiere. Con `--update` reescribe el lock.
- **FR-005**: El guardián DEBE ejecutarse como test dentro de `run_tests.sh` (un test que invoca el script). El paso de CI queda diferido: añadir un workflow al fork exige tocar archivos fuera de `examples/trace_pinger/`.
- **FR-006**: Los tests de propiedad DEBEN usar una semilla fija e imprimirla al fallar.
- **FR-007**: Los fixtures de tramas DEBEN usar el formato `<HEX>\t<json>` (`contracts/fixture-format.md`). Los de líneas usan el mismo esquema.
- **FR-008**: Toda la suite DEBE terminar en < 10 s en un portátil (para correrla en cada commit).

### Key Entities

- **WatchedFragment**: archivo, ancla de inicio, ancla de fin, texto normalizado, sha256.
- **UpstreamLock**: commit + lista de WatchedFragment.
- **FrameFixture**: bytes + expectativa (`echo` con tag/hash/snr_up_q, u `other` con type/route).
- **LineFixture**: línea + expectativa estructurada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % de las 10 000 tramas aleatorias de US1 y US2 pasan ida y vuelta.
- **SC-002**: Un cambio de una sola línea dentro de cualquier fragmento vigilado hace fallar el guardián (verificado con un test de mutación incluido en la suite).
- **SC-003**: Suite completa < 10 s.
- **SC-004**: ≥ 10 ecos reales y ≥ 2 tramas de otros tipos en los fixtures de campo antes de cerrar la fase de barrido (fase 004).

## Assumptions

- Los mocks de `test/mocks` bastan para compilar `Packet.cpp`: verificado el 2026-10-14 con un prototipo. El `env:native` del repo ya lo hace.
- Compilar `Mesh.cpp` real en host queda fuera de alcance (research R-1).
- La fase 001 está implementada y flasheada (Meshcore `0b85c69e`): `tracecore` ya existe y estos tests se añaden encima.
