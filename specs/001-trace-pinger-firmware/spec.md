# Feature Specification: Pinger TRACE mínimo para XIAO nRF52 + SX1262

**Feature Branch**: `001-trace-pinger-firmware`

**Created**: 2026-10-13

**Status**: Ready for planning (revisada 2026-10-14)

**Input**: User description: "Validar la alineación de una Yagi enviando tramas MeshCore compatibles con la mesh, sin montar todo el core. El test debe ser razonablemente rápido. Fase 1: firmware pinger por Serial, probado contra el repetidor con antena omni."

## Contexto

Un repetidor MeshCore que recibe un paquete `TRACE` con ruta directa, cuyo siguiente hash coincide con el suyo, añade `(int8)(SNR×4)` al campo `path` y lo retransmite (`Mesh.cpp` L42–65 del core local `/Users/120m4n/GitHub/Meshcore` @ `362ea302`). El pinger aprovecha esto: emite una trama TRACE de un salto y escucha el eco. De cada eco obtiene:

- **SNR de subida**: cómo oyó el repetidor al pinger. Viene dentro del eco.
- **SNR/RSSI de bajada**: cómo oye el pinger al repetidor. Lo mide la radio local.

No hace falta identidad, claves, login ni contactos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ping único a un repetidor (Priority: P1) 🎯 MVP

Con el pinger conectado por USB a un PC, el usuario configura el hash del repetidor y envía `PING`. En menos de 2 s ve una línea con el SNR de subida, el SNR y RSSI de bajada y el RTT, o un `timeout` explícito.

**Why this priority**: Es la medición elemental de la que depende todo el sistema. Sin ella no hay alineación que validar.

**Independent Test**: Con un repetidor a la vista y antena omni en el pinger, `SET hash=<H>` seguido de `PING` devuelve `P,…,ok,…` con SNR plausible (−20…+15 dB). Basta un terminal serie.

**Acceptance Scenarios**:

1. **Given** radio configurada con el preset de la mesh y `hash=A1`, **When** el usuario envía `PING`, **Then** el pinger transmite exactamente la trama `26 00 <tag:4> 00000000 00 A1` (12 bytes) y emite `P,<seq>,<tag>,ok,<rtt>,<snr_up>,<snr_dn>,<rssi_dn>,1` al recibir el eco.
2. **Given** el repetidor apagado, **When** el usuario envía `PING`, **Then** tras `timeout_ms` el pinger emite `P,<seq>,<tag>,timeout,,,,,0` y vuelve a quedar disponible.
3. **Given** un eco con `tag` distinto al esperado (otro usuario haciendo trace), **When** llega durante la ventana RX, **Then** se ignora y no cuenta como respuesta.
4. **Given** dos pings consecutivos, **When** se envían, **Then** cada uno usa un `tag` distinto. Esto evita que el repetidor los descarte como paquete ya visto (`calculatePacketHash` incluye el payload).

---

### User Story 2 - Ráfaga y modo continuo con estadísticas (Priority: P2)

El usuario envía `PING 5` para una ráfaga, o `GO`/`STOP` para pings continuos al intervalo configurado. Al final de cada ráfaga recibe un resumen con mediana, pérdida y número de muestras.

**Why this priority**: La alineación se decide con la mediana de varias muestras (el fading da ±1 dB), no con una sola.

**Independent Test**: `PING 5` produce 5 líneas `P,` y una `S,` cuya mediana coincide con la calculada a mano sobre las líneas `ok`.

**Acceptance Scenarios**:

1. **Given** `rate=1500`, **When** el usuario envía `PING 5`, **Then** se emiten 5 líneas `P,` con inicios de TX separados ≥ 1500 ms y luego `S,5,<ok>,<loss%>,<med_up>,<med_dn>,<med_rssi>,<busy>`.
2. **Given** `GO` activo, **When** el usuario envía `STOP`, **Then** no se inician más pings. Un ping en curso termina y se reporta. Si había una ráfaga en curso, se emite `S,` con los pings realizados.
3. **Given** el usuario intenta `SET rate=200`, **When** se procesa, **Then** responde `!ERR range rate>=1000` y conserva el valor anterior (Constitución II).

---

### User Story 3 - Modo monitor y captura cruda (Priority: P2)

El usuario activa `MON on`. Cada paquete LoRa recibido se registra en hexadecimal junto con su RSSI y SNR. Además, en modo ping, cada eco aceptado puede emitirse crudo (`raw=1`) para construir fixtures.

**Why this priority**: Sirve para detectar colisiones de hash (dos repetidores que responden), depurar parámetros de radio y generar los fixtures de campo que exige la fase 002.

**Independent Test**: Con `MON on`, al recibir un advert del repetidor aparece una línea `R,` cuyo hex empieza por `11` (ADVERT + FLOOD) o `10` (ADVERT + TRANSPORT_FLOOD) y es decodificable.

**Acceptance Scenarios**:

1. **Given** `MON on`, **When** llega cualquier paquete válido, **Then** se emite `R,<ms>,<rssi>,<snr>,<hex>`.
2. **Given** `MON on`, **When** el usuario envía `PING`, **Then** responde `!ERR state mon` (el monitor nunca transmite; lo mismo para `GO`).
3. **Given** `raw=1`, **When** llega un eco aceptado, **Then** se emite también su línea `R,`.
4. **Given** llegan dos ecos con el mismo `tag` y distinto SNR de subida, **When** termina la ventana RX, **Then** la línea `P,` reporta `n_resp=2` y se emite `#WARN hash_collision`.

---

### User Story 4 - Configuración persistente (Priority: P3)

El usuario ajusta frecuencia, BW, SF, CR, potencia, hash, intervalo y timeout por `SET`, consulta con `CFG?` y guarda con `SAVE`. La configuración sobrevive a un reinicio.

**Why this priority**: Es comodidad de campo. Con valores en código ya se puede probar.

**Independent Test**: `SET txp=5`, `SAVE`, reinicio y `CFG?` muestra `txp=5`.

**Acceptance Scenarios**:

1. **Given** una configuración guardada, **When** el pinger arranca, **Then** emite `#HELLO …` y `#CFG …` con los valores persistidos.
2. **Given** un valor fuera de rango (por ejemplo `sf=13`), **When** se hace `SET`, **Then** responde `!ERR range …` sin modificar nada.
3. **Given** `SET freq=…` válido, **When** se aplica, **Then** la radio se reconfigura sin reiniciar y el siguiente ping usa el nuevo valor.

### Edge Cases

- **Canal ocupado al transmitir**: se hace CAD/LBT y se reintenta hasta 3 veces con backoff aleatorio `nextInt(1,4)×120 ms` (el de `Mesh::getCADFailRetryDelay`), programado por `Pinger::tick`. Si sigue ocupado se reporta `status=busy`, que no cuenta como pérdida de enlace (FR-010).
- **`SET` de radio con un ping pendiente**: se responde `!ERR state busy` y no se cambia nada. Los `SET` no radio (`rate`, `raw`, `timeout`, `hash`) se aplican al siguiente ping.
- **Eco que llega después del timeout**: se descarta, porque el tag ya no está pendiente. Si `raw=1` se registra igual.
- **Overflow de `millis()`**: la aritmética de RTT usa resta sin signo de 32 bits.
- **Reinicio a mitad de `GO`**: arranca en estado `IDLE`. El modo continuo nunca se reanuda solo.
- **Hash `00` o `FF`**: se aceptan, pero se emite `#WARN hash_suspicious`.
- **Trama recibida malformada** (longitud o `path_len` inválidos según `Packet::isValidPathLen`): se ignora en silencio salvo con `MON on`, donde se registra con `R,`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El pinger DEBE construir tramas TRACE de un salto según `contracts/trace-frame.md` (header `0x26`, `path_len=0x00`, `tag`, `auth=0`, `flags=0x00`, hash de 1 byte).
- **FR-002**: Cada ping DEBE usar un `tag` de 32 bits obtenido de una fuente aleatoria de hardware (RNG del nRF52). Un tag no se reutiliza mientras esté pendiente.
- **FR-003**: La radio DEBE configurarse con los parámetros de la mesh local: frecuencia, BW, SF y CR configurables; sync word `0x12`; CRC on; header explícito; preámbulo 32 si SF ≤ 8 y 16 si SF ≥ 9. Valores por defecto: preset Australia de MeshCore, 915.800 MHz, BW 250 kHz, SF10, CR 4/5 (confirmado por el usuario el 2026-10-14; está dentro de la banda 915–928 MHz).
- **FR-004**: Tras transmitir, el pinger DEBE pasar a RX en ≤ 10 ms y aceptar como eco solo las tramas que cumplan: `header==0x26`, `path_len==0x01`, `payload[0..3]==tag pendiente`, `payload[8]==0x00` y `payload[9]==hash`.
- **FR-005**: El SNR de subida DEBE calcularse como `(int8_t)path[0] / 4.0`. El SNR y el RSSI de bajada son los reportados por la radio para esa trama.
- **FR-006**: El timeout de RX DEBE ser configurable. En `auto` vale `ceil(1.5 × RTT_max) + 200 ms`, con `RTT_max = ToA(12 B) + ToA(13 B) + 5 × 0.3 × ToA(15 B) + 20 ms` (conmutación TX/RX; ver research R-3).
- **FR-007**: El firmware DEBE imponer `rate ≥ 1000 ms` y un ciclo de trabajo de TX ≤ 10 % en ventana deslizante de 60 s. Si un ping lo excede se retrasa, no se descarta. `rate` es el intervalo entre **inicios** de TX: el siguiente ping empieza en `max(inicio_anterior + rate, reporte_anterior)`. Con el preset por defecto (ToA 177 ms) el límite permite ≈ 33 TX por minuto, así que `GO` con `rate=1500` se estrangula solo.
- **FR-008**: El pinger DEBE transmitir únicamente tramas `TRACE`/`DIRECT`. Cualquier otra ruta de código que transmita es un defecto.
- **FR-009**: El pinger DEBE exponer el protocolo de líneas `proto=1` de `contracts/line-protocol.md` por Serial USB a 115200 baudios.
- **FR-010**: `PING n` (1 ≤ n ≤ 50) DEBE emitir n líneas `P,` y una `S,` con la mediana de SNR de subida, SNR de bajada y RSSI sobre las respuestas `ok`, más `loss% = round(100·timeouts/(ok+timeouts))`. Los `busy` y `txerr` no cuentan como pérdida y se informan en el campo final `busy` de `S,`.
- **FR-011**: `MON on|off` DEBE alternar el modo solo-recepción, que emite `R,` por cada paquete recibido.
- **FR-012**: La configuración DEBE persistir en flash interna (`SAVE`) y cargarse al arrancar. Si está corrupta se usan los valores por defecto y se emite `#WARN cfg_reset`.
- **FR-013**: La potencia de TX por defecto DEBE ser 22 dBm, el máximo de la tarjeta, y el firmware NO impone ningún tope por debajo de eso. El caso de uso son enlaces de larga distancia con Yagi (p. ej. Cúcuta–El Picacho) y necesita toda la potencia. El cumplimiento de la normativa de PIRE es responsabilidad del operador.
- **FR-014**: Toda la lógica de FR-001, FR-004, FR-005, FR-006 y FR-010 DEBE vivir en `lib/tracecore` sin dependencias de Arduino (Constitución III).
- **FR-015**: Si hay más de un eco con el mismo tag, DEBE reportarse `n_resp` y `#WARN hash_collision`. La medición `P,` usa el primer eco.
- **FR-016**: El hash del repetidor objetivo NO está en el código ni tiene valor por defecto. Se cambia en cualquier momento con `SET hash=<2hex>` (también desde la app por el mismo protocolo, fase 003) y entra en vigor en el siguiente ping. `SAVE` solo lo recuerda para el próximo arranque. Sin hash definido, `PING` y `GO` responden `!ERR state nohash`.

### Key Entities

- **RadioConfig**: freq, bw, sf, cr, txp, sync word (fijo) y preámbulo (derivado).
- **PingerConfig**: RadioConfig + hash objetivo, rate_ms, timeout_ms|auto, raw.
- **TraceRequest**: seq, tag, hash, t_tx.
- **PingResult**: seq, tag, status, rtt_ms, snr_up, snr_dn, rssi_dn, n_resp.
- **BurstSummary**: n, ok, loss, medianas.
- **RawFrame**: t_ms, rssi, snr, bytes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Contra un repetidor a menos de 2 km con línea de vista, ≥ 90 % de los pings de una ráfaga de 20 son `ok`.
- **SC-002**: El tiempo entre el comando `PING` y la línea `P,` es ≤ 1.6 s en el 95 % de los casos con el preset por defecto SF10/BW250 (ToA 177 ms + `timeout=auto` 1207 ms = 1.38 s + margen).
- **SC-003**: Una ráfaga de 5 pings con resumen se completa en ≤ 8 s con `rate=1500` (4 × 1500 + 1384 ≈ 7.4 s).
- **SC-004**: Con el pinger fijo y sin cambios en el entorno, la mediana de SNR de subida de 5 ráfagas consecutivas varía ≤ 1.5 dB entre sí. Esa repetibilidad es la que permite comparar orientaciones.
- **SC-005**: Cero transmisiones de tipos distintos de TRACE/DIRECT en 1 h de operación continua, verificado con un segundo nodo en `MON`.

## Assumptions

- El repetidor objetivo ejecuta MeshCore con reenvío habilitado (`disable_fwd=false`) y una versión que soporta TRACE. El campo `flags` con tamaño de hash existe desde v1.11, pero con `flags=0` también funciona en versiones anteriores que ya tenían TRACE.
- El usuario conoce el primer byte de la clave pública del repetidor. Aparece en la app MeshCore, en el mapa de cobertura o en un advert capturado con `MON`.
- En esta fase el pinger usa antena omni. La Yagi entra en la fase de campo.
- Quedan fuera de alcance: BLE (fase 003), trazas multi-salto y hashes de 2 o 3 bytes (posible extensión: `flags=1`).
