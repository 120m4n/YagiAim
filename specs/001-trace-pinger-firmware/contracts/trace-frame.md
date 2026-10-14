# Contrato: trama TRACE de un salto (MeshCore wire format)

**Upstream de referencia**: core local `/Users/120m4n/GitHub/Meshcore` @ `362ea302` (rama `feature/i2c-actuator-public-channel`), verificado el 2026-10-14
— `src/Packet.h`, `src/Packet.cpp` (`writeTo`/`readFrom`), `src/Mesh.cpp` L42–65 y L601–619.

## Byte de header

```
bit  7 6 | 5 4 3 2 | 1 0
     ver | type    | route
     00  | 1001    | 10      → 0x26
```

- `route = ROUTE_TYPE_DIRECT (0x02)`. Sin transport codes.
- `type = PAYLOAD_TYPE_TRACE (0x09)`.
- `ver = 0`.

## `path_len`

- bits 0–5 = número de entradas, bits 6–7 = tamaño de hash − 1 (`Packet::getPathHashSize`).
- En TRACE el campo `path` **no lleva hashes**: guarda un byte de SNR por salto recorrido (`Mesh.cpp` L61). El pinger siempre usa entradas de 1 byte (bits 6–7 = 0).

## Petición (pinger → repetidor) — 12 bytes

| Off | Len | Campo | Valor |
|---:|---:|---|---|
| 0 | 1 | header | `0x26` |
| 1 | 1 | path_len | `0x00` |
| 2 | 4 | trace_tag | u32 little-endian, aleatorio por ping |
| 6 | 4 | auth_code | `00 00 00 00` (el reenvío no lo valida) |
| 10 | 1 | flags | `0x00` → bits 0–1 = 0: hash de ruta de `1 << 0 = 1` byte |
| 11 | 1 | route[0] | primer byte de la pubkey del repetidor (`H`) |

Ejemplo (`tag=0x78563412`, `H=0xA1`):
```
26 00 12 34 56 78 00 00 00 00 00 A1
```

## Decisión del repetidor (normativa, de `Mesh.cpp`)

```
si header es DIRECT y tipo TRACE y path_len < MAX_PATH_SIZE:
  i = 9                                    # tras tag(4)+auth(4)+flags(1)
  path_sz = flags & 0x03
  len    = payload_len - i                 # bytes de ruta en el payload
  offset = path_len << path_sz
  si offset >= len           → onTraceRecv()   (fin de ruta: el que lo oye lo consume)
  si hash(self) == payload[i+offset .. +(1<<path_sz)]
     y allowPacketForward() y !wasSeen():
       path[path_len++] = (int8)(SNR*4)
       retransmitir (retardo aleatorio 0 .. 5 × ToA × direct_tx_delay_factor)
```

Con `path_len=0`, `len=1`, `offset=0` y `payload[9]==H`, el repetidor H reenvía. En el eco `offset=1 >= len=1`, así que ningún repetidor lo reenvía de nuevo y el pinger lo recibe como fin de ruta.

## Eco (repetidor → pinger) — 13 bytes

| Off | Len | Campo | Valor |
|---:|---:|---|---|
| 0 | 1 | header | `0x26` |
| 1 | 1 | path_len | `0x01` |
| 2 | 1 | path[0] | `int8(SNR_up × 4)` |
| 3 | 4 | trace_tag | igual que en la petición |
| 7 | 4 | auth_code | `00 00 00 00` |
| 11 | 1 | flags | `0x00` |
| 12 | 1 | route[0] | `H` |

Ejemplo (SNR de subida = −6.25 dB → `-25` → `0xE7`):
```
26 01 E7 12 34 56 78 00 00 00 00 00 A1
```

## Reglas de aceptación del eco (pinger)

1. `len == 13`.
2. `bytes[0] == 0x26` y `bytes[1] == 0x01`.
3. `u32le(bytes[3..6])` ∈ tags pendientes.
4. `bytes[11] == 0x00` y `bytes[12] == H`.
5. `snr_up = (int8_t)bytes[2] / 4.0`, rango válido [−32, +31.75].

Cualquier otra trama no es un eco: se ignora, o se registra con `R,` en `MON`/`raw=1`.

## Deduplicación

`Packet::calculatePacketHash` = SHA256(type ‖ path_len (solo TRACE) ‖ payload). El repetidor descarta paquetes ya vistos (`wasSeen`), así que **dos pings con el mismo tag dentro de la ventana de la tabla de vistos no generan eco**. Por eso el tag es aleatorio en cada ping (FR-002).

## Extensiones (fuera de alcance de 001)

- Hash de 2 bytes: `flags=0x01` y `route` de 2 bytes. Requiere repetidores ≥ v1.11.
- Trazas multi-salto: `route = [H1, H2, …]`. El eco acumula un SNR por salto.
