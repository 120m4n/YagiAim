# Contrato: protocolo de líneas `proto=1`

Transporte-agnóstico: Serial USB a 115200 8N1 (fase 001) y BLE NUS (fase 003). ASCII, una línea por mensaje terminada en `\n` (se tolera `\r\n`). Longitud máxima: 160 bytes, terminador incluido.

## Comandos (host → pinger)

Sin distinción de mayúsculas/minúsculas en las palabras clave. Valores hex sin `0x`.

| Comando | Respuesta inmediata | Efecto |
|---|---|---|
| `HELLO` | `#HELLO fw=<semver> proto=1 radio=SX1262 id=<6hex>` | — |
| `CFG?` | `#CFG freq=… bw=… sf=… cr=… txp=… hash=… rate=… timeout=… raw=…` | — |
| `SET <k>=<v>` | `#OK <k>=<v>` o `!ERR <code> <detalle>` | Aplica en caliente |
| `SAVE` | `#OK saved` | Persiste la config |
| `PING` | (asíncrono) `P,…` | 1 ping |
| `PING <n>` | (asíncrono) n × `P,…` + `S,…` | Ráfaga, 1 ≤ n ≤ 50 |
| `GO` | `#OK go` | Pings continuos con inicios separados ≥ `rate` ms (`!ERR state mon` en `MON`) |
| `STOP` | `#OK stop` | Detiene `GO` o una ráfaga (una ráfaga emite `S,` con lo realizado) |
| `MON on` / `MON off` | `#OK mon=on|off` | Modo solo-recepción |

### Claves de `SET`

| Clave | Tipo | Rango | Default |
|---|---|---|---|
| `freq` | MHz, 3 decimales | 902.000–928.000 | 915.800 |
| `bw` | kHz | 7.8, 10.4, 15.6, 20.8, 31.25, 41.7, 62.5, 125, 250, 500 | 250 |
| `sf` | int | 5–12 | 10 |
| `cr` | int (4/x) | 5–8 | 5 |
| `txp` | dBm int | −9–22 | 22 |
| `hash` | 2 hex | 00–FF | — (sin hash, `PING` responde `!ERR state nohash`) |
| `rate` | ms | 1000–60000 | 1500 |
| `timeout` | ms o `auto` | 200–10000 | `auto` |
| `raw` | 0/1 | — | 0 |

Preset por defecto: Australia de MeshCore (915.8 / 250 / 10 / 5). `txp` arranca en 22 dBm, el máximo de la tarjeta, sin tope por firmware (FR-013). `SET` de claves de radio (`freq`, `bw`, `sf`, `cr`, `txp`) con un ping pendiente responde `!ERR state busy`.

## Eventos (pinger → host)

Prefijo de una letra o símbolo. Campos separados por `,`; un campo vacío significa "no aplica".

### `P` — resultado de ping
```
P,<seq>,<tag>,<status>,<rtt_ms>,<snr_up>,<snr_dn>,<rssi_dn>,<n_resp>
```
| Campo | Formato |
|---|---|
| seq | u32 decimal, monótono desde el arranque |
| tag | 8 hex en mayúsculas (u32 en el orden de impresión natural, no el del cable) |
| status | `ok` \| `timeout` \| `busy` \| `txerr` |
| rtt_ms | u32, vacío si status≠ok |
| snr_up, snr_dn | dB con 2 decimales y signo explícito (`+3.25`, `-6.00`) |
| rssi_dn | dBm con 1 decimal (`-97.5`) |
| n_resp | u8, número de ecos aceptados con ese tag |

Ejemplos:
```
P,17,78563412,ok,412,-6.25,-4.50,-108.0,1
P,18,0A1B2C3D,timeout,,,,,0
```

### `S` — resumen de ráfaga
```
S,<n>,<ok>,<loss_pct>,<med_snr_up>,<med_snr_dn>,<med_rssi_dn>,<busy>
```
`loss_pct = round(100·timeouts/(ok+timeouts))`; `busy` cuenta los pings con `busy`/`txerr`, que no entran en la pérdida. Las medianas se calculan sobre las muestras `ok`; si `ok==n` en tamaño par, es el promedio de los dos centrales. Si `ok=0`, los tres últimos campos van vacíos.
```
S,5,5,0,-6.25,-4.50,-108.0,0
S,5,0,100,,,,0
```

### `R` — trama cruda (MON o raw=1)
```
R,<t_ms>,<rssi>,<snr>,<hex>
```
`hex` en mayúsculas, sin separadores, máximo 64 bytes de trama. Si la trama es mayor se trunca a 64 B y se añade el sufijo ASCII `..` (la línea no supera 160 B).
```
R,123456,-108.0,-4.50,2601E7123456780000000000A1
```

### Info, advertencias y errores
```
#HELLO …   #CFG …   #OK …
#WARN <code> [detalle]        códigos: hash_collision, snr_saturated, cfg_reset, hash_suspicious, duty_wait <ms>
!ERR <code> [detalle]         códigos: syntax, unknown, range, state (`nohash`, `mon`, `busy`, `flash`), radio
```

## Reglas

1. El pinger nunca emite una línea parcial: cada evento es atómico en el transporte.
2. Un comando inválido no altera el estado.
3. Una línea que empieza por un prefijo desconocido debe ser ignorada por el host (compatibilidad hacia adelante dentro de `proto=1`).
4. Añadir campos al **final** de `P`/`S`/`R` es compatible. Cambiar el orden o el significado exige `proto=2`.

## Fixtures

`firmware/pinger/test/fixtures/lines/*.txt`: un caso por línea, en formato `<línea>\t<json esperado>`. Los consumen `tracecore` (gtest) y `MeshAzimuthTests` (XCTest).
