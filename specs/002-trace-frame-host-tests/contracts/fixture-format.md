# Contrato: formato de fixtures

UTF-8, una entrada por línea: `<payload>\t<json>`. Las líneas que empiezan con `#` son comentarios. Las vacías se ignoran.

## Tramas — `firmware/pinger/test/fixtures/frames/*.txt`

`<payload>` = hex en mayúsculas sin separadores.

```text
# origen: spike KISS 2026-10-15, repetidor A1, omni, 1.2 km
2601E7123456780000000000A1	{"kind":"echo","tag":"78563412","hash":"A1","snr_up_q":-25,"rssi_dn":-108,"snr_dn_q":-18}
11…	{"kind":"other","route":1,"type":4}
2600123456780000000000A1	{"kind":"request","tag":"78563412","hash":"A1"}
```

| kind | Campos requeridos | Aserción |
|---|---|---|
| `echo` | tag, hash, snr_up_q | `parseEcho` ok con esos valores; `readFrom` ok |
| `request` | tag, hash | `build(tag,hash)` == bytes; `readFrom` ok |
| `other` | route, type | `parseEcho` rechaza; `readFrom` ok con route/type |
| `invalid` | reason | `parseEcho` rechaza; si `"readFrom":false`, también lo rechaza upstream |

`rssi_dn` y `snr_dn_q` son informativos (metadatos de la radio receptora) y no se verifican.

## Líneas — `firmware/pinger/test/fixtures/lines/*.txt`

`<payload>` = línea del protocolo `proto=1` sin `\n`.

```text
P,17,78563412,ok,412,-6.25,-4.50,-108.0,1	{"type":"P","seq":17,"tag":"78563412","status":"ok","rtt_ms":412,"snr_up":-6.25,"snr_dn":-4.5,"rssi_dn":-108.0,"n_resp":1}
P,18,0A1B2C3D,timeout,,,,,0	{"type":"P","seq":18,"tag":"0A1B2C3D","status":"timeout","n_resp":0}
S,5,5,0,-6.25,-4.50,-108.0	{"type":"S","n":5,"ok":5,"loss_pct":0,"med_snr_up":-6.25,"med_snr_dn":-4.5,"med_rssi_dn":-108.0}
SET rate=200	{"cmd":"SET","key":"rate","error":"range"}
```

Los consumidores son `tracecore` (gtest, en esta fase) e `ios/YagiAimTests` (XCTest, fase 003). El directorio se copia como recurso del bundle de tests de iOS mediante una referencia de carpeta en `project.yml`.
