# Feature Specification: Enlace BLE NUS pinger ↔ YagiAim con muestras atadas al rumbo

**Feature Branch**: `003-ble-nus-yagiaim-link`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "BLE NUS en el firmware y cliente en YagiAim que asocia SNR con rumbo."

## Contexto

Las fases 001 y 002 entregan un pinger que mide el enlace por Serial con un protocolo de líneas verificado. Para alinear en campo, el usuario debe tener el teléfono sobre el boom de la Yagi, sin cables. Esta fase lleva el **mismo** protocolo por BLE (Nordic UART Service). Además, la app registra cada medición junto con el rumbo verdadero del teléfono **en el instante de la transmisión**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Protocolo de líneas por BLE NUS en el pinger (Priority: P1) 🎯 MVP

El pinger anuncia un servicio NUS. Cualquier central BLE puede enviarle comandos `proto=1` y recibir los eventos exactamente igual que por Serial.

**Why this priority**: Sin transporte inalámbrico no hay uso en campo. Además, se puede probar sin la app (nRF Connect o un script `bleak`), lo que desacopla firmware e iOS.

**Independent Test**: Con nRF Connect: conectar a `YagiPinger-XXXX`, suscribirse a TX, escribir `HELLO\n` en RX → llega `#HELLO … proto=1 …`. Luego `PING` → llega `P,…`.

**Acceptance Scenarios**:

1. **Given** el pinger encendido, **When** un central escanea, **Then** ve el nombre `YagiPinger-<4 hex>` y el UUID de servicio NUS en el advertising.
2. **Given** un central conectado y suscrito, **When** escribe `PING\n` (en uno o varios fragmentos), **Then** recibe `P,…\n` íntegra, aunque llegue en varias notificaciones si el MTU es pequeño.
3. **Given** Serial y BLE conectados a la vez, **When** llega un comando por cualquiera de los dos, **Then** los eventos resultantes se emiten por **ambos** transportes.
4. **Given** `GO` activo iniciado desde BLE, **When** el central se desconecta, **Then** el pinger ejecuta `STOP` automáticamente y emite `#WARN ble_lost_stop` por Serial.
5. **Given** un central ya conectado, **When** un segundo central intenta conectar, **Then** el pinger no lo acepta: deja de anunciarse mientras hay conexión.

---

### User Story 2 - Conectar YagiAim al pinger y ver el enlace en vivo (Priority: P1)

En la pantalla de apuntamiento el usuario toca "Conectar pinger". La app encuentra el pinger y se conecta. Configura `hash` a partir del repetidor seleccionado y muestra en vivo SNR de subida, SNR de bajada, RSSI, RTT y pérdida, junto a la brújula.

**Why this priority**: Es el valor central de la fase: ver la calidad del enlace mientras se gira la antena.

**Independent Test**: Con un pinger y un repetidor real (o un pinger en modo simulación, ver FR-010), la app muestra valores que coinciden con los de un log Serial simultáneo.

**Acceptance Scenarios**:

1. **Given** un repetidor seleccionado con `hashPrefix = "A1"`, **When** la app conecta, **Then** envía `HELLO`, valida `proto=1`, envía `SET hash=A1` y muestra "Conectado · A1".
2. **Given** un repetidor sin `hashPrefix`, **When** la app conecta, **Then** pide el prefijo (2 hex) en el editor del repetidor antes de permitir pings.
3. **Given** conectado, **When** el usuario activa "En vivo", **Then** la app envía `PING` cada `rate` ms (cadencia controlada por la app, ver FR-012) y actualiza la tarjeta de enlace y una sparkline de los últimos 30 SNR de subida.
4. **Given** `proto` ≠ 1 en `#HELLO`, **When** se recibe, **Then** la app se desconecta y muestra "Firmware incompatible (proto=N)".
5. **Given** que el pinger se apaga, **When** se pierde la conexión, **Then** la app lo indica en ≤ 3 s e intenta reconectar en segundo plano mientras la pantalla siga abierta.

---

### User Story 3 - Lecturas atadas al rumbo (Priority: P2)

El usuario orienta la antena y toca "Medir aquí". La app hace una ráfaga de 5 pings, registra para cada uno el rumbo verdadero del teléfono en el momento de enviar el comando y al recibir el resultado, y guarda una **lectura** (mediana de SNR de subida y bajada, RSSI, pérdida, rumbo medio, delta respecto al azimut calculado). Las lecturas se listan en la sesión.

**Why this priority**: Es la materia prima del barrido y el diagrama polar de la fase 004. Sin rumbo por muestra, los datos no sirven para validar la orientación.

**Independent Test**: Con la app conectada, tomar lecturas en 0°, +30° y 180° respecto al azimut. La sesión muestra 3 lecturas con su rumbo, su delta y las medianas. La lectura a 180° tiene un SNR de subida claramente menor (≥ 6 dB para una Yagi de 3 elementos con línea de vista).

**Acceptance Scenarios**:

1. **Given** conectado y con brújula válida, **When** el usuario toca "Medir aquí", **Then** se envían 5 `PING` separados `rate` ms. Cada muestra guarda `heading_tx`, `heading_rx`, `heading_accuracy`, la ubicación y el `P,` completo.
2. **Given** una muestra donde `|heading_rx − heading_tx| > 2°`, **When** se guarda, **Then** se marca `unstable` y se excluye de la mediana. Si quedan < 3 muestras estables, la lectura se marca "repetir".
3. **Given** `headingAccuracy < 0` o > 15°, **When** el usuario toca "Medir aquí", **Then** la app pide calibrar y no mide.
4. **Given** una lectura completa, **When** se muestra, **Then** incluye `Δ = rumbo − azimut` con signo, la mediana de SNR de subida y la pérdida.

---

### User Story 4 - Persistencia y exportación de sesiones (Priority: P3)

Cada sesión (repetidor, fecha, ubicación, lecturas y muestras crudas) se guarda localmente y se puede exportar como CSV con la hoja de compartir.

**Why this priority**: Permite comparar días y antenas, y alimenta el análisis contra MMANA-GAL de la fase 005. No bloquea el uso en campo.

**Independent Test**: Tomar 3 lecturas, cerrar y reabrir la app: la sesión sigue ahí. Al exportar, el CSV abre en Numbers con una fila por muestra.

**Acceptance Scenarios**:

1. **Given** una sesión con lecturas, **When** la app se reinicia, **Then** la sesión aparece en el historial del repetidor.
2. **Given** una sesión, **When** se exporta, **Then** el CSV tiene la cabecera de `contracts/session-csv.md` y una fila por muestra.

### Edge Cases

- **Bluetooth apagado o sin permiso**: estado explícito con un botón a Ajustes. Nunca un spinner infinito.
- **MTU pequeño (23 B)**: el firmware fragmenta y la app reensambla por `\n`. Las líneas de hasta 160 B funcionan.
- **Varias líneas en una notificación**: el buffer de la app las separa todas.
- **Línea corrupta o prefijo desconocido**: se ignora (contrato de líneas, regla 3) y se cuenta en métricas de depuración.
- **El usuario sale de la pantalla de apuntamiento con "En vivo" activo**: la app deja de enviar `PING`. El pinger nunca queda en `GO` por culpa de la app, porque la app no usa `GO`.
- **App en segundo plano**: se detienen los pings. No hay modo background en esta fase.
- **Dos pingers cerca**: la lista de dispositivos muestra todos y el último usado se recuerda por identificador de periférico.

## Requirements *(mandatory)*

### Functional Requirements — firmware

- **FR-001**: El pinger DEBE exponer NUS: servicio `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`, RX (write / write without response) `6E400002-…`, TX (notify) `6E400003-…`.
- **FR-002**: El nombre anunciado DEBE ser `YagiPinger-<4 hex>`, con los últimos 2 bytes de la dirección BLE. El UUID de NUS va en el advertising o en el scan response.
- **FR-003**: El protocolo BLE DEBE ser byte a byte el `proto=1` de `001/contracts/line-protocol.md`. Se reensambla por `\n` en RX y se fragmenta según MTU−3 en TX.
- **FR-004**: Los eventos DEBEN difundirse a todos los transportes activos (Serial y BLE) mediante un `LineSink` compuesto. Los comandos se aceptan desde cualquiera.
- **FR-005**: Al desconectarse BLE, si había `GO` o una ráfaga iniciada desde BLE, el pinger DEBE ejecutar `STOP` (Constitución II).
- **FR-006**: Máximo 1 conexión BLE. El advertising se detiene mientras hay conexión y se reanuda al desconectar.
- **FR-007**: Seguridad: sin emparejamiento en v1. [NEEDS CLARIFICATION: ¿se requiere PIN/bonding para evitar que un tercero cercano dispare pings? El riesgo está acotado por la Constitución II (rate/duty/solo TRACE), por eso se propone diferirlo].
- **FR-008**: El firmware DEBE compilarse con el fork de framework de MeshCore (parche BLE contra bloqueos por conexiones rápidas, ver plan de la 001).

### Functional Requirements — app iOS

- **FR-009**: `PingerLink` (CoreBluetooth central) DEBE escanear por el servicio NUS, listar los periféricos con nombre `YagiPinger-*`, conectar, descubrir, suscribirse a TX y escribir en RX respetando `maximumWriteValueLength(for: .withoutResponse)`.
- **FR-010**: La capa de transporte DEBE abstraerse tras el protocolo `LineTransport`, con dos implementaciones: `BLELineTransport` y `SimulatedPinger`. Este último genera líneas `P,` con SNR en función del delta respecto al azimut, siguiendo un patrón tipo Yagi. Sirve para tests y demos sin hardware.
- **FR-011**: `LineCodec.swift` DEBE parsear `#HELLO`, `#CFG`, `#OK`, `#WARN`, `!ERR`, `P`, `S` y `R`, y validarse con los fixtures de `firmware/pinger/test/fixtures/lines/` (Constitución IV).
- **FR-012**: La app DEBE controlar la cadencia enviando `PING` individuales (nunca `GO`), para conocer el instante de cada TX y fijar `heading_tx`. El intervalo de la app nunca es menor que el `rate` reportado por `#CFG`.
- **FR-013**: `Repeater` DEBE ganar el campo `hashPrefix: String?` (2 hex, validado), editable en `RepeaterEditor` y migrado sin perder los repetidores existentes (Codable con valor por defecto).
- **FR-014**: Cada `Sample` DEBE guardar: `t_tx`, `t_rx`, `heading_tx`, `heading_rx`, `heading_accuracy`, lat/lon/alt y su precisión, `target_bearing`, `delta` y los campos de `P`. Se marca `unstable` si `|Δheading| > 2°` (configurable).
- **FR-015**: Una `Reading` DEBE resumir N muestras (por defecto 5): medianas de SNR de subida, SNR de bajada y RSSI sobre las muestras estables y `ok`, pérdida, rumbo medio circular y delta medio.
- **FR-016**: Las sesiones DEBEN persistir como JSON en `Application Support/Sessions/<uuid>.json` y exportarse a CSV (`contracts/session-csv.md`) con `ShareLink`.
- **FR-017**: `Info.plist` DEBE incluir `NSBluetoothAlwaysUsageDescription` en español.

### Key Entities

- **PingerDevice**: identificador de periférico, nombre, fw, proto, última config.
- **Sample**: ver FR-014.
- **Reading**: ver FR-015; pertenece a una Session.
- **Session**: id, repeater (snapshot), inicio, ubicación, lecturas, muestras, txp usado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: De tocar "Conectar" a "Conectado · A1" en ≤ 5 s con el pinger a menos de 3 m.
- **SC-002**: La latencia BLE añadida (escritura `PING` → `P,` en la app, menos la latencia medida en Serial) es ≤ 100 ms en el p95.
- **SC-003**: 30 min de "En vivo" sin desconexiones con el pinger a menos de 2 m (los dos en el boom).
- **SC-004**: 100 % de las muestras guardadas tienen `heading_tx` y `heading_rx` válidos. Con el teléfono girando a ≥ 5°/s durante una medición, ≥ 90 % de las muestras se marcan `unstable`.
- **SC-005**: Con `SimulatedPinger`, el delta del máximo de SNR de una sesión simulada de 7 lecturas coincide con el azimut ±1° (prueba de la cadena completa sin hardware).
- **SC-006**: El parser Swift pasa el 100 % de los fixtures de líneas que pasa el C++.

## Assumptions

- El teléfono y el pinger van juntos en el boom (BLE a < 2 m).
- La app sigue siendo YagiAim (iOS 17+, SwiftUI, `@Observable`). Se añade CoreBluetooth sin dependencias de terceros.
- Fuera de alcance: diagrama polar y veredicto automático (fase 004), modo background, varios pingers a la vez y actualización OTA.
- `hashPrefix` lo introduce el usuario. Su autocompletado desde un advert capturado (`R,`) queda como mejora futura.
