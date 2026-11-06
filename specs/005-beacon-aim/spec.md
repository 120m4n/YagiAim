# Feature Specification: Orientar la Yagi escuchando una baliza CW (ampliación sin degradación)

**Feature Branch**: `005-beacon-aim` (sin crear: la crea quien empiece a codificar)

**Created**: 2026-11-06

**Status**: Ready for planning

**Tipo**: **ampliación sin degradación**. Todo lo que existe (modo TRACE con el pinger `YagiPinger-…` `proto=1`, lecturas, sesiones, CSV, simulador) sigue igual y sus tests siguen pasando. El modo nuevo es opcional y solo se activa con el pinger nuevo.

**Decisiones (2026-11-06, sustituyen lo que diga en contra el resto de documentos)**:
- **Activación oculta**: el modo baliza aparece tras 5 toques seguidos en el nombre del desarrollador, en el menú hamburguesa.
- **Funcionalidad aparte**: no comparte vistas ni datos con el modo TRACE/`YagiPinger`. Vistas nuevas para el ejercicio (medidor y barrido) y para los resultados (bisección). Ya no se integra en `AimView`/`PingerSection` (sustituye T034) ni usa `Repeater.beaconFreq` (sustituye T030).
- **Sitios de baliza propios**: el usuario da de alta de antemano el marcador del sitio de la baliza (como hoy con los repetidores, en un almacén propio). El rumbo estimado por la bisección se contrasta con el azimut a ese marcador.
- **Enlace**: segunda instancia de `PingerLink` con `kind = .pingPong` (solo `PingPong-PI-`, `proto=2`, último dispositivo propio). La instancia TRACE no cambia.
- Lo central es el **barrido y la bisección**.

**Input**: "Una variante de MeshAzimuth que escuche la baliza CW para orientar la Yagi. Se usaría para montar infraestructura nueva punto a punto. Orientar, no medir."

## Contexto

Hoy MeshAzimuth orienta la Yagi hacia un repetidor **existente** de la malla: le manda pings `TRACE` y muestra el SNR del eco (~0,7 lecturas/s, 10 % de tiempo en el aire).

Para montar un enlace **nuevo** entre dos sitios propios hay una opción mejor: dejar una **baliza CW siempre encendida** en el sitio lejano (B) y orientar la Yagi del sitio A escuchándola con el pinger. El pinger no transmite y lee el RSSI instantáneo con 0,5 dB unas 6 veces por segundo. Luego se repite al revés: la baliza en A y se orienta B.

El hardware y el firmware ya existen en el repo hermano `ping-ponger-meshcore` (rama `exp/analizador-pobre`):
- **Pinger** fw ≥ 0.5.1 (`ProMicro_trace_pinger` o `Xiao_nrf52_trace_pinger`). Se anuncia como `PingPong-PI-<8 hex>` con `proto=2` y tiene el comando `MEAS` (contrato en `contracts/meas-line.md`).
- **Baliza** `*_cw_beacon_low|mid|high` (−9 / 0 / 14 dBm). Emite CW en 914.000 MHz por defecto y no se conecta al teléfono. Guía: `ping-ponger-meshcore/firmware/examples/cw_beacon/FLASHING.md`.

**Qué NO es**: medir ni comparar antenas (eso es `ping-ponger-meshcore`); orientar hacia un repetidor ajeno donde no se puede dejar baliza (eso sigue siendo el modo TRACE).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Conectar el pinger nuevo sin romper el viejo (Priority: P1)

El selector de pingers muestra también los `PingPong-PI-…`. Si el usuario elige uno, la app lo acepta (`proto=2`, fw ≥ 0.5.1) y solo ofrece el modo baliza. Con un `YagiPinger-…` todo funciona exactamente como hoy.

**Why this priority**: sin conexión no hay modo baliza, y es donde más riesgo hay de romper lo existente.

**Independent Test**: con el pinger simulado en los dos modos, y con las dos placas reales si las hay. El modo TRACE con `YagiPinger` hace lo mismo que antes; los tests existentes pasan sin cambios.

**Acceptance Scenarios**:
1. **Given** un `YagiPinger-…` (`proto=1`), **When** se conecta, **Then** el handshake, "En vivo", "Medir aquí", las sesiones y el CSV funcionan igual que antes.
2. **Given** un `PingPong-PI-…` con fw ≥ 0.5.1, **When** se conecta, **Then** queda listo para el modo baliza y la tarjeta TRACE dice que ese pinger se usa con baliza.
3. **Given** un `PingPong-PI-…` con fw < 0.5.1, **When** se conecta, **Then** la app pide actualizar el firmware y no ofrece el modo baliza.
4. **Given** un pinger `proto=2`, **When** el usuario intenta "En vivo" o "Medir aquí" (TRACE), **Then** esos controles no aparecen.

---

### User Story 2 — Medidor de la baliza en vivo (Priority: P1) 🎯 MVP

En la pantalla de apuntamiento, con el pinger nuevo, el usuario activa **Baliza**, escribe o confirma la frecuencia (914.000 por defecto) y ve en grande el nivel actual en dBm (unas 6 veces por segundo), el máximo retenido con el rumbo donde se dio, y una barra de "cuánto falta para el máximo". Gira la Yagi despacio y busca el máximo.

**Why this priority**: es el valor central: orientar con una señal continua y rápida.

**Independent Test**: con el pinger simulado (baliza a un rumbo conocido y patrón de Yagi), al girar el rumbo simulado el nivel sube hacia el rumbo de la baliza y el máximo retenido queda a ±2° de él.

**Acceptance Scenarios**:
1. **Given** el modo baliza activo, **Then** la app manda `SET freq=<baliza>` y mide el piso una vez (`SET freq=<baliza − 1 MHz>`, `MEAS 64`, vuelta a la frecuencia de la baliza).
2. **Given** el medidor en marcha, **Then** encadena `MEAS 32` sin pausa y actualiza la pantalla con cada `M,`. Cada lectura queda atada al rumbo y a la inclinación del teléfono en el instante de la respuesta.
3. **Given** un nivel por encima de −50 dBm, **Then** avisa "demasiado fuerte: el máximo se aplana; usa una baliza de menor nivel o más distancia".
4. **Given** un nivel a menos de 10 dB del piso, **Then** avisa "señal débil" y la bisección queda desactivada.
5. **Given** una lectura con `kept < 0,8·n` (tráfico ajeno), **Then** se descarta del máximo y de la bisección y se cuenta en pantalla.
6. **Given** salir de la pantalla, pasar a segundo plano o desactivar Baliza, **Then** el bucle se detiene (como `stopLive` hoy).

---

### User Story 3 — Bisección a −3 dB (Priority: P1)

Después de barrer el lóbulo de un lado a otro, la app marca los rumbos donde la señal cae 3 dB a cada lado del máximo y propone el **rumbo central**: más preciso que el máximo, que es plano. Muestra también la diferencia con el azimut del mapa.

**Why this priority**: es lo que convierte la señal en una orientación precisa (±3–5° frente a ±20° del máximo en una Yagi de 3 elementos).

**Independent Test**: test unitario de la función pura con barridos sintéticos: patrón simétrico, asimétrico, con ruido de 0,5 dB, con un solo lado y con el cruce de 0°/360°.

**Acceptance Scenarios**:
1. **Given** un barrido que cruza los dos puntos de −3 dB, **Then** la app muestra el rumbo central, el ancho del haz medido y la diferencia con el azimut del mapa.
2. **Given** un barrido que solo cruza un lado, **Then** dice "barre más hacia la izquierda/derecha" y no propone centro.
3. **Given** un barrido que cruza 0°/360°, **Then** el centro se calcula bien (media circular).
4. **Given** "Nuevo barrido", **Then** borra el barrido y el máximo retenido, pero no la frecuencia ni el piso.
5. **Given** el centro propuesto, **When** el usuario toca "Usar como objetivo", **Then** la brújula guía hacia ese rumbo en vez del azimut del mapa, sin cambiar el punto guardado.

---

### User Story 4 — Tono (Priority: P2)

Un tono cuya altura sube con el nivel, como en la caza del zorro, para orientar sin mirar la pantalla.

**Independent Test**: con el simulador, el tono sube al acercarse al rumbo de la baliza y se calla al pararlo.

**Acceptance Scenarios**:
1. **Given** el tono activado, **Then** la frecuencia del tono es función monótona del nivel relativo al máximo retenido (por ejemplo 400 Hz a −20 dB y 1200 Hz en el máximo).
2. **Given** silenciar, pasar a segundo plano o salir, **Then** el tono se detiene.

---

### User Story 5 — Guardar el barrido (Priority: P3)

Exportar el barrido como CSV (una fila por lectura con rumbo, inclinación, nivel y la estimación final) para documentar el montaje.

**Independent Test**: el CSV de un barrido simulado cumple `contracts/beacon-sweep-csv.md`.

### Edge Cases

- **Baliza apagada o en otra frecuencia**: solo se oye el piso (≈ −99 dBm). La app lo dice con "no oigo la baliza en <freq>: revisa que esté encendida (su LED parpadea) y su frecuencia".
- **Reflexión más fuerte que el camino directo**: el máximo puede caer lejos del azimut del mapa. La app muestra la diferencia; la decisión es del usuario.
- **Cuerpo cerca de la Yagi**: cambia unos dB. La guía pide barrer despacio, con la misma postura y el brazo fuera del haz.
- **Brújula sin calibrar**: el rumbo de cada lectura no vale. Se reutiliza el aviso actual de precisión > ±15°; la bisección queda desactivada.
- **El pinger reinicia**: vuelve a 915.800 MHz. Al reconectar, la app reaplica `SET freq` antes de seguir midiendo.
- **`MEAS` ocupado** (`!ERR state busy`): se reintenta en el siguiente ciclo, como hoy con `busy` en "En vivo".

## Requirements *(mandatory)*

### Compatibilidad (no degradación)

- **FR-001** El flujo TRACE con `YagiPinger-…` `proto=1` no cambia: handshake, "En vivo", "Medir aquí", lecturas, sesiones JSON y CSV de sesión. Todos los tests existentes pasan sin tocarlos.
- **FR-002** El JSON de repetidores guardado antes de esta fase se lee igual; los campos nuevos son opcionales (`decodeIfPresent`, como `hashPrefix` en la 003).
- **FR-003** Sin dependencias SPM nuevas. Solo frameworks del sistema (CoreBluetooth, CoreLocation, Swift Charts, AVFoundation para el tono).

### Enlace

- **FR-010** El escáner acepta los prefijos `YagiPinger-` y `PingPong-PI-`. `PingerDevice` sabe de qué tipo es.
- **FR-011** El handshake acepta `proto=1` (como hoy) y `proto=2` con `role=pinger` y fw ≥ 0.5.1. Con `proto=2` no manda `SET hash` ni permite `PING`.
- **FR-012** El codec reconoce la línea `M,<n>,<kept>,<mean>,<sd>,<median>,<min>,<max>` (contrato `contracts/meas-line.md`) y se valida con el fixture `events_m.txt` del firmware.
- **FR-013** `PingerLink` añade `meas(n:)` y un bucle `startMeter/stopMeter` que encadena `MEAS 32`, con la misma regla de una petición a la vez que hoy. Al perder el enlace, se detiene y lo retoma al reconectar, como "En vivo".

### Baliza y orientación

- **FR-020** La frecuencia de la baliza se guarda por punto del mapa (campo opcional `beaconFreq` en `Repeater`). Por defecto, 914.000 MHz. Se valida en 902–928 y a ≥ 1 MHz de 915.800.
- **FR-021** El piso se mide al activar el modo, a 1 MHz por debajo de la frecuencia de la baliza.
- **FR-022** Cada lectura se guarda con nivel, `kept/n`, rumbo (`loc.heading`) e inclinación (`motion.pitch`) en el instante de la respuesta.
- **FR-023** Máximo retenido: el mayor nivel válido del barrido y su rumbo.
- **FR-024** Bisección (función pura en `Beacon/BeaconBisect.swift`):
  - agrupa las lecturas válidas en celdas de 2° de rumbo (máximo por celda);
  - busca el máximo y, a cada lado, el primer cruce de −3 dB con interpolación lineal;
  - el centro es la media circular de los dos cruces, y el ancho del haz su diferencia;
  - si falta un lado, devuelve qué lado barrer.
- **FR-025** Avisos: nivel > −50 dBm; nivel < piso + 10 dB; lecturas con tráfico ajeno; brújula con precisión > ±15°.
- **FR-026** "Usar como objetivo" pasa el rumbo central a la brújula como objetivo temporal hasta salir de la pantalla.
- **FR-027** Tono opcional (US4), desactivado por defecto.
- **FR-028** `SimulatedPinger` responde a `HELLO` como `proto=2` fw 0.5.1 (modo baliza del simulador) y a `MEAS` con el patrón `yagiGain` que ya tiene, más el piso y ruido de 0,5 dB, cuantizado a 0,5 dB.

### Key Entities

- **BeaconReading**: instante, nivel (dBm), sd, n, kept, rumbo, inclinación, válida.
- **BeaconSweep**: punto del mapa, frecuencia, piso, lecturas, máximo retenido.
- **BisectResult**: centro, cruce izquierdo y derecho, ancho del haz, nivel máximo, o "falta barrer a la izquierda/derecha".

## Success Criteria *(mandatory)*

- **SC-001 (no degradación)**: todos los tests existentes pasan sin modificarlos; el flujo TRACE con `YagiPinger` se comporta igual en el simulador y en la placa.
- **SC-002 (ritmo)**: con el pinger real a menos de 1 m del teléfono, ≥ 5 lecturas por segundo.
- **SC-003 (bisección, simulador)**: con baliza a un rumbo conocido, Yagi de 65° de haz y 0,5 dB de ruido, el centro queda a ±3° del rumbo verdadero en ≥ 9 de 10 barridos de ±60°.
- **SC-004 (campo)**: en un enlace real de ≥ 200 m, dos barridos seguidos dan centros a ≤ 5° entre sí.
- **SC-005 (sin hardware)**: los tests nuevos (codec `M`, bisección y simulador de baliza) corren en el simulador de iOS sin placas.

## Assumptions

- La baliza está en el sitio lejano, con su antena y en el mástil o cerca de donde irá el nodo.
- Un solo pinger conectado a la vez (como hoy). El pinger nuevo va en el boom, a menos de 1 m del teléfono (el BLE de la Faketec no llega mucho más lejos).
- La inclinación sirve para registrar la elevación; la orientación en elevación queda como mejora futura.

## Out of Scope

- Android (React Native): una fase posterior, cuando la de iOS esté validada en campo.
- Modo TRACE con el pinger `proto=2` (el pinger nuevo también hace TRACE, pero eso es otra fase).
- Controlar la baliza desde la app: no tiene enlace.
- Medir o comparar antenas.
