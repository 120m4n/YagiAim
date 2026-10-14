# Data Model: 002 Verificación en host

## RepeaterModel (`firmware/pinger/test/support/RepeaterModel.{h,cpp}`)

```cpp
// Origen: meshcore-dev/MeshCore@a366955 src/Mesh.cpp L42-68 (bloque W1)
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
- `snr` se cuantiza como upstream: `(int8_t)(snr*4)` (truncamiento hacia cero, **no** redondeo). Por ejemplo, −6.3 da −25.
- `seen` usa `pkt.calculatePacketHash()` upstream (con el mock SHA256).

## Fixtures

| Entidad | Campos |
|---|---|
| FrameFixture | bytes, kind ∈ {echo, request, other, invalid}, tag?, hash?, snr_up_q?, route?, type?, readFrom? |
| LineFixture | line, expected (JSON → `PingResult`/`BurstSummary`/`RawFrame`/`CommandResult`) |

Parser de fixtures para C++: `test/support/Fixtures.{h,cpp}` con un mini-parser JSON plano (solo objetos de un nivel con strings, enteros, floats y bools). No se añade una librería JSON.

## UpstreamLock (`firmware/pinger/test/upstream-trace.lock`)

```json
{ "commit": "a366955",
  "fragments": { "W1": {"file":"src/Mesh.cpp","sha256":"…","chars":0}, … } }
```
