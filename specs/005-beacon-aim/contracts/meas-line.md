# Contrato: `MEAS` del pinger `proto=2` (lo que usa el modo baliza)

Fuente de verdad: `ping-ponger-meshcore`, `firmware/examples/trace_catcher/main.cpp` (fw ≥ 0.5.1) y el fixture `firmware/examples/trace_pinger/tests/fixtures/lines/events_m.txt`. Aquí solo va lo que la app necesita.

## Anuncio BLE y handshake

- Nombre BLE: `PingPong-CA-<8 hex>` (catcher; `PingPong-PI-` en placas flasheadas antes de ping-ponger-meshcore b5b1f418, que la app también acepta). Mismo servicio NUS que el `YagiPinger` (UUIDs en `specs/003-…/contracts/ble-nus-gatt.md`).
- `HELLO` → `#HELLO fw=0.5.1 proto=2 role=catcher radio=SX1262 id=5E58C8`
- `CFG?` → `#CFG freq=915.800 bw=250 sf=10 cr=5 txp=22 hash= rate=1500 timeout=auto raw=0`
- `STOP` → `#OK stop` y `MON off` → `#OK mon=off`, como en `proto=1`.

## Comandos

| Comando | Respuesta | Notas |
|---|---|---|
| `SET freq=<MHz>` | `#OK freq=914.000` | 902.000–928.000; si no, `!ERR range freq 902.000-928.000`. No transmite |
| `MEAS [n]` | `M,…` | n = 16–256 (por defecto 64). 32 lecturas ≈ 70 ms en el pinger |
| `MEAS [n] wait=<s>` | `#OK meas n=<n> wait=<s>` y luego `M,…` | No hace falta en este modo |
| `MEAS?` | la última `M,…` | `!ERR state busy` si espera; `!ERR state nolast` si no hay |

Errores de `MEAS`: `!ERR range meas 16-256`, `!ERR range wait 0-120`, `!ERR syntax`, `!ERR rfoff`, `!ERR state busy` (hay una ráfaga, `GO`, `MON` o un `PONG` en curso). Un firmware anterior a 0.5.0 responde `!ERR unknown`.

## Línea `M`

```
M,<n>,<kept>,<mean>,<sd>,<median>,<min>,<max>
M,64,64,-99.25,0.71,-99.0,-101.0,-98.0
```

| Campo | Tipo | Significado |
|---|---|---|
| n | entero | lecturas tomadas |
| kept | entero ≤ n | las que quedan tras el filtro mediana ± 3·1,4826·MAD (quita ráfagas de paquetes ajenos) |
| mean | dBm, 2 decimales | media de las que quedan: **es el nivel** |
| sd | dB, 2 decimales | desviación de las que quedan |
| median, min, max | dBm, 1 decimal | de las que quedan |

Regla de la app: `kept < 0,8·n` ⇒ lectura no válida (un paquete ajeno cubrió parte de la ventana y el filtro pudo quedarse con él).

## Valores de referencia (medidos el 2026-11-06, Faketec)

- Piso en 902–928 MHz con BW 250 kHz: ≈ −99 dBm (ruido de banda ancha; depende del entorno).
- Resolución 0,5 dB; las 64 lecturas de un `MEAS` son prácticamente independientes.
- Por encima de ≈ −50 dBm el receptor empieza a comprimirse.
