# Data Model: 002 Verificación en host

## RepeaterModel (`examples/trace_pinger/tests/support/RepeaterModel.{h,cpp}`)

```cpp
// Origen: Meshcore (fork 120m4n) @362ea302 src/Mesh.cpp L42-68 (bloque W1)
//         examples/simple_repeater/MyMesh.cpp allowPacketForward (W10)
namespace tracecore_test {
enum class RepeaterAction { Release, Retransmit, TraceComplete };
struct RepeaterModel {
  uint8_t pub_key[32];
  bool disable_fwd = false;
  std::set<std::array<uint8_t, MAX_HASH_SIZE>> seen;   // wasSeen/markSeen
  RepeaterAction onRecv(mesh::Packet& pkt, float snr);  // muta pkt como upstream
};
}
```

Invariantes:
- Solo trata `isRouteDirect() && TRACE`. Cualquier otro paquete → `Release`, porque está fuera de alcance.
- `snr` se cuantiza como upstream: `(int8_t)(snr*4)` (truncamiento hacia cero, **no** redondeo). Por ejemplo, −6.3 da −25. El modelo fija `pkt._snr` antes de aplicar la decisión, igual que la radio (`getSNR()*4 == _snr`).
- `seen` usa `pkt.calculatePacketHash()` upstream (con el mock SHA256).

## Fixtures

| Entidad | Campos |
|---|---|
| FrameFixture | bytes, kind ∈ {echo, request, other, invalid}, tag?, hash?, snr_up_q?, route?, type?, readFrom? |
| LineFixture | line, expected (JSON → `PingResult`/`BurstSummary`/`RawFrame`/`CommandResult`) |

Parser de fixtures para C++: `tests/support/Fixtures.{h,cpp}` con un mini-parser JSON plano (solo objetos de un nivel con strings, enteros, floats y bools). No se añade una librería JSON.

## UpstreamLock (`examples/trace_pinger/tests/upstream-trace.lock`)

```json
{ "commit": "362ea302",
  "fragments": { "W1": {"file":"src/Mesh.cpp","sha256":"…","chars":0}, … } }
```

`commit` es informativo: cambia con cada commit del fork. El guardián compara solo los hashes de los fragmentos. Cada fragmento guarda también su `text` normalizado: así el guardián puede mostrar un diff legible cuando algo cambia (el hash solo no lo permite).
