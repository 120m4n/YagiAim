# Contrato: formato de fixtures

UTF-8, una entrada por línea: `<payload>\t<json>`. Un comentario es una línea que empieza con `#` seguido de espacio (o `#` solo): las líneas del protocolo `#HELLO`, `#CFG`, `#OK` y `#WARN` no lo son. Las vacías se ignoran.

## Tramas — `examples/trace_pinger/tests/fixtures/frames/*.txt`

`<payload>` = hex en mayúsculas sin separadores.

```text
# origen: pinger XIAO con raw=1, 2026-10-14, repetidor 4F, antena omni
2601E7123456780000000000A1	{"kind":"echo","tag":"78563412","hash":"A1","snr_up_q":-25,"rssi_dn":-108,"snr_dn_q":-18}
11…	{"kind":"other","route":1,"type":4}
2600123456780000000000A1	{"kind":"request","tag":"78563412","hash":"A1"}
```

| kind | Campos requeridos | Aserción |
|---|---|---|
| `echo` | tag, hash, snr_up_q | `parseEcho` ok con esos valores; `readFrom` ok |
| `request` | tag, hash | `build(tag,hash)` == bytes; `readFrom` ok |
| `other` | route, type | `parseEcho` rechaza; `readFrom` ok con route/type |
| `invalid` | reason; opcionales `hash` (el que se pasa a `parseEcho`, por defecto `A1`) y `readFrom` | `parseEcho` rechaza; si `readFrom` está presente, `Packet::readFrom` upstream devuelve exactamente ese bool (`false` = también lo rechaza el parser upstream) |

`rssi_dn` y `snr_dn_q` son informativos (metadatos de la radio receptora) y no se verifican.

## Líneas — `examples/trace_pinger/tests/fixtures/lines/*.txt`

`<payload>` = línea del protocolo `proto=1` sin `\n`.

```text
P,17,78563412,ok,412,-6.25,-4.50,-108.0,1	{"type":"P","seq":17,"tag":"78563412","status":"ok","rtt_ms":412,"snr_up":-6.25,"snr_dn":-4.5,"rssi_dn":-108.0,"n_resp":1}
P,18,0A1B2C3D,timeout,,,,,0	{"type":"P","seq":18,"tag":"0A1B2C3D","status":"timeout","n_resp":0}
S,5,5,0,-6.25,-4.50,-108.0,0	{"type":"S","n":5,"ok":5,"loss_pct":0,"med_snr_up":-6.25,"med_snr_dn":-4.5,"med_rssi_dn":-108.0,"busy":0}
SET rate=200	{"cmd":"SET","key":"rate","error":"range"}
```

### Archivos y esquema del JSON

| Archivo | `<payload>` | JSON esperado |
|---|---|---|
| `events_p.txt` | línea `P,…` | `type:"P"`, `seq`, `tag`, `status`, y si `ok`: `rtt_ms`, `snr_up`, `snr_dn` (dB), `rssi_dn` (dBm); `n_resp`. Los campos vacíos de la línea no aparecen en el JSON |
| `events_s.txt` | línea `S,…` | `type:"S"`, `n`, `ok`, `busy`, `timeouts` (lo usa el formateador C++; la línea solo lleva `loss_pct`), y si existen `loss_pct`, `med_snr_up`, `med_snr_dn`, `med_rssi_dn` |
| `events_r.txt` | línea `R,…` | `type:"R"`, `t_ms`, `rssi`, `snr`, `hex` (tal como aparece en la línea, con `..` si se truncó); si es truncada: `truncated:true` y `total_len` (el formateador recibe `total_len` bytes `0xAB`) |
| `info.txt` | `#HELLO`, `#CFG`, `#OK`, `#WARN` o `!ERR` | `type` ∈ `HELLO`, `CFG`, `OK`, `WARN`, `ERR` y sus campos (`code`, `detail`, …). Lo consume el parser del host (iOS); el lado C++ solo comprueba que están bien formadas, porque las produce a través de `commands.txt` |
| `commands.txt` | comando | `cmd`, `reply` (primera línea que emite el pinger), `reply2` opcional, `setup` opcional (`nohash`, `mon` o `pending`), `error` opcional (código) |

`commands.txt` cubre todos los `!ERR` que emite el firmware. `!ERR radio` figura en el contrato del protocolo pero ningún camino de `tracecore` lo emite todavía.

Los consumidores son `tracecore` (gtest, en esta fase) e `MeshAzimuthTests` (XCTest, fase 003). El directorio se copia como recurso del bundle de tests de iOS mediante una referencia de carpeta en `project.yml`.
