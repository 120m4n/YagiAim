# Research: 001 Pinger TRACE

## R-1 Mecanismo de medición: TRACE de un salto

**Decision**: Usar `PAYLOAD_TYPE_TRACE` con `ROUTE_TYPE_DIRECT` y ruta `[H]`.

**Rationale**: Es el único tipo de paquete que un repetidor estándar reenvía sin cifrado ni identidad del emisor y que además **devuelve el SNR con que lo recibió** (`Mesh.cpp` L61). Al ser directo no inunda la mesh: solo retransmite H, una vez.

**Alternatives considered**:
- *Companion stock + `CMD_SEND_TRACE_PATH` (36) / `PUSH_CODE_TRACE_DATA` (0x89)*: funciona, pero obliga a ejecutar todo el core en el nodo y la cadencia depende del companion. Queda como plan B.
- *Login al repetidor + estadísticas de vecinos*: requiere contraseña, cifrado ECDH y la respuesta es lenta.
- *Escucha pasiva de adverts*: los adverts son poco frecuentes (minutos u horas), inviable para un barrido de menos de 90 s.

## R-2 Formato de trama verificado en upstream

**Decision**: Usar el core local `/Users/120m4n/GitHub/Meshcore` (`MESHCORE_DIR`) @ `362ea302`, sin submódulo. Verificado el 2026-10-14: `Mesh.cpp` L42–65 coincide con `contracts/trace-frame.md`. Ver ese contrato.

**Hallazgos**:
- `Packet::writeTo`: `header ‖ [transport codes] ‖ path_len ‖ path ‖ payload`.
- `path_len` codifica número de entradas (bits 0–5) y tamaño de hash − 1 (bits 6–7). `isValidPathLen` rechaza tamaño 4.
- En TRACE la ruta va **al final del payload** (tras `tag‖auth‖flags`) y `path[]` acumula SNRs (`Mesh.cpp` L698–699, comentario "path is appended to end of PAYLOAD").
- `flags & 0x03` = log2 del tamaño de hash de la ruta (desde v1.11).
- `sendFlood()` rechaza TRACE: solo es válido en directo.

## R-3 Tiempos (ToA) y timeout

Fórmula de Semtech: header explícito, CRC on, LDRO solo si T_sym > 16 ms, preámbulo según `preambleLengthForSF` (32 si SF ≤ 8, 16 si no). Retardo de retransmisión del repetidor: `rand(0, 5 × ToA(len+2) × 0.3)` (`simple_repeater/MyMesh.cpp` L559–562, `nextInt(0, 5t+1)` con `t = ToA(len+2) × direct_tx_delay_factor`). El repetidor fija 0.3 en L901, pero el default de `CommonCLI.h` es 0 y se cambia con `set direct.txdelay`: si el repetidor objetivo lo modificó, hay que usar `timeout` manual.

| Preset | ToA petición 12 B | ToA eco 13 B | Retardo rep. máx | RTT máx | `timeout=auto` |
|---|---:|---:|---:|---:|---:|
| SF7 / BW62.5 | 132 ms | 142 ms | 213 ms | ~506 ms | 960 ms |
| SF8 / BW62.5 | 263 ms | 263 ms | 425 ms | ~972 ms | 1658 ms |
| SF10 / BW250 | 177 ms | 177 ms | 296 ms | ~671 ms | 1207 ms |
| SF11 / BW250 | 354 ms | 354 ms | 531 ms | ~1260 ms | 2090 ms |

**Decision**: `timeout_auto = ceil(1.5 × RTT_max) + 200 ms`. El margen absorbe CAD/LBT del repetidor y la cola si está ocupado.

## R-4 Biblioteca de radio

**Decision**: RadioLib (la misma familia que usa MeshCore, `SX1262`) con pines de `variants/xiao_nrf52/platformio.ini`:

| Señal | Pin |
|---|---|
| NSS | D4 |
| DIO1 | D1 |
| RESET | D2 |
| BUSY | D3 |
| RXEN | D5 |
| TXEN | NC (DIO2 como RF switch) |
| TCXO | DIO3 1.8 V |
| Límite de corriente | 140 mA |
| RX boosted gain | on |

**Rationale**: Con los mismos ajustes que el firmware oficial no hay sorpresas de sensibilidad ni de conmutación RF. `setSyncWord(0x12)`, `setCRC(1)`, `explicitHeader()`, `setPreambleLength(32|16)`.

## R-5 Arquitectura del firmware

**Decision**: Máquina de estados no bloqueante en `loop()`: `IDLE → TX → RX_WAIT → REPORT → (IDLE|DUTY_WAIT)`, con interrupción DIO1 que solo levanta una bandera. Toda la lógica de decisión está en `tracecore::Pinger`, que recibe eventos (`onTxDone(t)`, `onRx(bytes, rssi, snr, t)`, `tick(t)`) y produce acciones y líneas. El cascarón Arduino solo traduce.

**Rationale**: Principio III. Además permite simular en host secuencias completas de ping, timeout, colisión y duty cycle.

## R-6 Saturación de SNR y tope de potencia

**Decision**: no se trata. El uso real es un enlace largo sin repetidores cercanos, donde la señal es débil, no saturada. Se transmite siempre a 22 dBm sin tope por firmware.

## R-7 Aleatoriedad del tag

**Decision**: TRNG del nRF52840 (`NRF_RNG`, a través de `random()` sembrado con el TRNG, o la API del SoftDevice) y comprobar que no coincide con tags pendientes. Un tag repetido dentro de la tabla de vistos del repetidor produce un timeout falso (ver contrato, Deduplicación).

## R-8 Persistencia

**Decision**: `InternalFileSystem` (LittleFS de Adafruit nRF52) con un archivo `/pinger.cfg` binario versionado (`magic`, `version`, struct y CRC16). Es lo mismo que usa MeshCore en nRF52.

## R-9 Firmware oficial `kiss_modem` de MeshCore

**Hallazgo**: upstream trae `examples/kiss_modem` con el entorno `Xiao_nrf52_kiss_modem` (`docs/kiss_modem_protocol.md`). Expone la radio como TNC KISS por serie:
- `Data (0x00)` transmite bytes crudos.
- Cada trama recibida llega seguida de `RxMeta (0xF9)` = SNR×4 (int8) + RSSI (int8).
- `TxDone (0xF8)`.
- `SetRadio (0x09)` y `SetTxPower (0x0A)`.
- `TXDELAY` vale 500 ms por defecto, configurable con `0x01`.

No ejecuta el core de mesh.

**Decision**: usarlo como **spike de des-riesgo (Phase 0)**. Con un script Python de unas 80 líneas se valida en menos de 1 h que el repetidor real devuelve el eco TRACE, antes de escribir firmware. **No** reemplaza al pinger propio por tres razones:
1. Es solo serie (USB/UART), sin BLE, y la fase 003 necesita BLE hacia el iPhone.
2. El Principio II (rate/duty/solo TRACE) tiene que aplicarse en el dispositivo, no en el host.
3. El CSMA p-persistente y el `TXDELAY` del KISS meten jitter en el RTT.

**Alternatives considered**: hacer del pinger un cliente del protocolo KISS por BLE (patchear `kiss_modem` para añadir NUS). Se rechaza por ahora porque obliga a mantener un fork de upstream. Se puede reconsiderar si el pinger propio da problemas de radio.

## R-10 `path_hash_size` de la red

Algunos presets de la comunidad definen `network_settings.path_hash_size = 2`. No afecta al pinger: el repetidor compara el hash de la ruta TRACE con el tamaño que indica `flags & 0x03` del **paquete** (`Mesh.cpp` L50, L58), no con la configuración de la red. Con `flags=0` y 1 byte basta. En redes densas, `flags=1` (2 bytes) reduce colisiones; es la extensión prevista.

## Pendientes

- ~~**P-1** Preset de radio~~ **Cerrado 2026-10-14**: preset Australia, 915.8 MHz / BW 250 / SF10 / CR 5 (FR-003).
- ~~**P-2** PIRE~~ **Cerrado 2026-10-14**: sin tope; responsabilidad del operador (FR-013).
