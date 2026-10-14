# Contrato: fragmentos upstream vigilados

Commit base: `a366955` (meshcore-dev/MeshCore, 2026-09-30).

Cada fragmento se extrae por **anclas de texto**, no por número de línea, para que un cambio no relacionado que desplace líneas no dispare el guardián.

| ID | Archivo | Ancla inicio | Ancla fin (inclusive) | Por qué |
|---|---|---|---|---|
| W1 | `src/Mesh.cpp` | `if (pkt->isRouteDirect() && pkt->getPayloadType() == PAYLOAD_TYPE_TRACE) {` | primer `return ACTION_RELEASE;` + `}` siguientes | Decisión de reenvío TRACE (lo modela `RepeaterModel`) |
| W2 | `src/Mesh.cpp` | `Packet* Mesh::createTrace(` | `return packet;` + `}` | Layout del payload que emite el firmware oficial |
| W3 | `src/Packet.h` | `#define PH_ROUTE_MASK` | `#define PAYLOAD_TYPE_RAW_CUSTOM` | Bits de header y códigos de tipo/ruta |
| W4 | `src/Packet.h` | `uint8_t getPathHashSize()` | `void setPathHashSizeAndCount(` (línea completa) | Codificación de `path_len` |
| W5 | `src/Packet.cpp` | `bool Packet::isValidPathLen(` | `}` de cierre | Validación de `path_len` |
| W6 | `src/Packet.cpp` | `void Packet::calculatePacketHash(` | `}` de cierre | Deduplicación (FR-002 de la fase 001) |
| W7 | `src/Packet.cpp` | `uint8_t Packet::writeTo(` | `}` de cierre de `readFrom` | Serialización |
| W8 | `src/MeshCore.h` | `#define MAX_HASH_SIZE` | `#define MAX_TRANS_UNIT` | Límites |
| W9 | `examples/simple_repeater/MyMesh.cpp` | `uint32_t MyMesh::getDirectRetransmitDelay(` | `}` de cierre | Retardo de retransmisión (timeout auto, R-3 de la 001) |
| W10 | `examples/simple_repeater/MyMesh.cpp` | `bool MyMesh::allowPacketForward(` | `}` de cierre | Política de reenvío |

## Normalización

1. Quitar comentarios `// …` hasta fin de línea y `/* … */`.
2. Colapsar todo espacio en blanco (incluidos los saltos de línea) a un espacio.
3. `strip()`.

## Lock

`firmware/pinger/test/upstream-trace.lock` (JSON):
```json
{
  "commit": "a366955",
  "fragments": {
    "W1": {"sha256": "…", "chars": 1234},
    …
  }
}
```

## Procedimiento de actualización (bump del submódulo)

1. `git -C third_party/MeshCore fetch && git -C third_party/MeshCore checkout <nuevo>`
2. `python3 firmware/pinger/tools/check_upstream_trace.py`: si falla, leer el diff.
3. Si el cambio afecta la semántica: actualizar `RepeaterModel`, el contrato de trama de la 001 y los tests.
4. `python3 firmware/pinger/tools/check_upstream_trace.py --update`
5. PR con título `bump(MeshCore): a366955 → <nuevo>` y el resumen del diff.
