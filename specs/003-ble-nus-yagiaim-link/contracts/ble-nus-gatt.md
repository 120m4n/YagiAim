# Contrato: GATT del pinger (Nordic UART Service)

## Advertising

| Campo | Valor |
|---|---|
| Nombre completo | `YagiPinger-<4 hex>` (por ejemplo `YagiPinger-1A2B`) |
| UUID 128-bit | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` (en el scan response si no cabe en el adv) |
| Flags | LE General Discoverable, BR/EDR not supported |
| Intervalo | 100 ms los primeros 30 s, luego 500 ms |
| TX power adv | 0 dBm |
| Conectable | sí, mientras no haya un central conectado |

## Servicio NUS

| Característica | UUID | Propiedades | Dirección |
|---|---|---|---|
| RX | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` | Write, Write Without Response | central → pinger (comandos) |
| TX | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` | Notify | pinger → central (eventos) |

No hay otras características obligatorias. El Device Information Service (`0x180A`, firmware revision = semver) es opcional.

## Framing

- Contenido: líneas `proto=1` terminadas en `\n`, idénticas a Serial.
- **TX**: el pinger encola la línea completa y la envía en trozos de `min(MTU−3, 244)` bytes. Una notificación puede contener el final de una línea y el inicio de la siguiente.
- **RX**: el pinger concatena las escrituras hasta `\n`. Si el buffer supera 160 B sin `\n`, lo descarta y responde `!ERR syntax`.
- La app hace lo mismo en sentido contrario.

## Parámetros de conexión

| Parámetro | Solicitado por el pinger |
|---|---|
| MTU | 247 (iOS suele negociar 185) |
| Intervalo de conexión | 15–30 ms |
| Latencia de periférico | 0 |
| Supervision timeout | 4 s |

## Ciclo de vida

```
ADVERTISING ──connect──▶ CONNECTED ──(CCCD TX on)──▶ READY
     ▲                                               │
     └──────────────disconnect (STOP si GO/ráfaga)◀───┘
```

- Al pasar a READY el pinger **no** emite nada por iniciativa propia. La app arranca con `HELLO`.
- Al desconectar: `STOP` implícito si la ráfaga o `GO` vino de BLE, `#WARN ble_lost_stop` (a los transportes activos) y se reanuda el advertising.

## Seguridad

v1: Security Mode 1 Level 1 (sin cifrado ni emparejamiento). PIN/bonding diferido a v2 (spec FR-007).
