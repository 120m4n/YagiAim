# Feature Specification: Brújula lite en Apple Watch Series 3, conectada a MeshAzimuth (iOS)

**Feature Branch**: `005-watch-compass-lite`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Requiero ahora versión lite brújula en iWatch Serie 3, conectada a la app de Swift."

## Hechos que condicionan el diseño (verificados el 2026-10-15)

| Hecho | Consecuencia |
|---|---|
| El Apple Watch Series 3 **no tiene magnetómetro**: la app Brújula solo existe desde el Series 5 | El reloj **no puede medir rumbo**. La brújula del reloj es un **espejo** de la del iPhone, que es el sensor (el teléfono va sobre el boom) |
| El Series 3 llega como máximo a **watchOS 8.8.1** | Destino de despliegue **watchOS 8.0**: sin `@Observable` (watchOS 10), sin Swift Charts (9), sin `.sensoryFeedback` ni `.numericText()` (10) |
| Xcode 26 admite watchOS 8 como destino mínimo y para depurar en el dispositivo | Se compila con el Xcode actual |
| El Series 3 se empareja con iPhones en iOS 11 o posterior, incluidos iOS 18 y 26 | Funciona con el iPhone de las capturas (iOS 26) |
| Series 3 sin pantalla siempre activa (llegó con el Series 5) | La app del reloj solo se ve con la muñeca levantada |

## Caso de uso

El usuario está en el mástil o la torre girando la Yagi, con el iPhone fijo y plano sobre el boom (como exige la app). No puede mirar el teléfono. Levanta la muñeca y ve en el reloj cuánto y hacia dónde girar. Al quedar alineado, el reloj vibra.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver cuánto girar en la muñeca (Priority: P1) 🎯 MVP

Con la pantalla de apuntamiento abierta en el iPhone, el reloj muestra el nombre del repetidor, una brújula simplificada con la aguja del objetivo **respecto al boom**, la instrucción "Gira N°" con su sentido o "Alineado", y el azimut. Todo con los mismos valores que el iPhone.

**Why this priority**: Es la función completa en su forma mínima.

**Independent Test**: Con el iPhone en la pantalla de apuntamiento y el reloj con la app abierta, girar el iPhone: en el reloj, "Gira N°" y la aguja siguen al iPhone con un retardo ≤ 500 ms, y los números coinciden con los del iPhone.

**Acceptance Scenarios**:

1. **Given** el iPhone en `AimView` con rumbo y ubicación válidos, **When** el reloj tiene la app al frente, **Then** muestra el nombre del repetidor, "Gira N°" con flecha horaria (Δ > 0) o antihoraria (Δ < 0), la aguja girada Δ grados respecto a la marca fija superior (el boom) y el azimut `%.1f° <cardinal>`, todo igual que el iPhone.
2. **Given** que el iPhone pasa a "Alineado" (con la histéresis de `Geo.isAligned` evaluada **en el iPhone**), **When** llega el estado, **Then** el reloj muestra "Alineado" en verde, la cuña y la aguja en verde, y reproduce el patrón háptico de alineado (FR-012).
3. **Given** que el iPhone sale de "Alineado", **When** llega el estado, **Then** el reloj vuelve a "Gira N°" y corta el patrón háptico si estaba en curso.
4. **Given** que el usuario cambia la tolerancia en el iPhone, **When** llega el estado, **Then** la cuña del reloj usa la nueva tolerancia (`max(tolerancia, 1)`).

---

### User Story 2 - Estados sin datos y reconexión (Priority: P1)

El reloj dice siempre por qué no muestra la brújula: el iPhone no está en la pantalla de apuntamiento, no hay comunicación, no hay brújula o no hay ubicación. Al volver los datos, se recupera solo.

**Why this priority**: Sin esto, una pantalla congelada se confunde con "estoy alineado", un error peligroso en la torre.

**Independent Test**: Cerrar la pantalla de apuntamiento en el iPhone → el reloj pasa a "Abre Apuntar en el iPhone" en ≤ 1 s. Alejar el iPhone o apagar su Bluetooth → el reloj marca los datos como desactualizados en ≤ 3 s. Reabrir → vuelve solo.

**Acceptance Scenarios**:

1. **Given** el iPhone sin `AimView` visible (o la app en segundo plano), **When** el reloj está al frente, **Then** muestra "Abre Apuntar en el iPhone" y no muestra ninguna aguja.
2. **Given** que no llega ningún estado durante 3 s, **When** pasa ese tiempo, **Then** el reloj atenúa la brújula y muestra "Sin datos del iPhone" (nunca deja una instrucción vieja como si fuera actual).
3. **Given** que el iPhone no tiene rumbo (`heading == nil`), **When** llega el estado, **Then** el reloj muestra "Brújula no disponible" (el mismo texto que `AimView`).
4. **Given** que el iPhone no tiene ubicación (`AimInfo == nil`), **When** llega el estado, **Then** el reloj muestra "Obteniendo ubicación…" (el mismo texto que `AimView`).
5. **Given** `usingMagneticFallback` en el iPhone, **When** llega el estado, **Then** el reloj muestra el aviso corto "Norte magnético" en el color `target`.
6. **Given** que el usuario levanta la muñeca después de bajarla, **When** la app vuelve a estar activa, **Then** pide el estado actual al iPhone y lo muestra en ≤ 1 s (sin esperar al siguiente cambio).

---

### User Story 3 - Distancia y precisión de la brújula (Priority: P2)

Debajo de la instrucción, el reloj muestra la distancia al repetidor y la precisión de la brújula del iPhone, para saber si fiarse de la lectura.

**Why this priority**: Información de apoyo; la US1 ya permite apuntar.

**Acceptance Scenarios**:

1. **Given** un estado válido, **When** se muestra, **Then** la distancia sigue el formato de `AimInfo.distanceText` (≥ 1000 m → `%.2f km`; si no, `%.0f m`) y la precisión el de `AimView` (`±%.0f°` o "sin calibrar").
2. **Given** una precisión peor que 15° o no válida, **When** se muestra, **Then** aparece en el color `target` (es la misma regla que `SessionRules.headingIsValid`).

### Edge Cases

- **El reloj no gira la brújula con la muñeca**: es un espejo del boom. La marca superior representa el boom, no el reloj. Lo explica la primera pantalla del reloj, una sola vez (FR-016).
- **Cruce del norte**: la aguja del reloj se anima por el camino más corto, porque se dibuja con Δ ∈ (−180, 180] y no con el rumbo absoluto. No hereda la vuelta larga del dial del iPhone, porque el reloj no dibuja un dial giratorio.
- **Mensajes desordenados o duplicados**: cada estado lleva `seq` creciente; el reloj descarta los que lleguen con `seq` menor o igual al último mostrado.
- **iPhone con la app cerrada**: un mensaje del reloj despierta la app del iPhone en segundo plano, pero sin `AimView` visible la respuesta es `idle`. El reloj nunca abre pantallas en el iPhone.
- **Varios relojes**: WatchConnectivity solo habla con el reloj activo emparejado; no se gestiona nada más.
- **Batería del reloj**: solo hay tráfico con la app del reloj al frente y `AimView` visible en el iPhone.

## Requirements *(mandatory)*

### Functional Requirements — iPhone (cambios mínimos en la app existente)

- **FR-001**: Nuevo `WatchBridge` (WatchConnectivity) en la app iOS, activado al arrancar, que solo emite mientras `AimView` está visible y la app está activa (los mismos límites que ya respetan los pings: `AimView.swift` L96–98).
- **FR-002**: El estado que se envía se arma con los valores que ya calcula `AimView`: nombre del repetidor, `AimInfo` (azimut, distancia, Δ), `loc.heading`, `loc.headingAccuracy`, `loc.usingMagneticFallback`, `tolerance` y el estado `aligned` que ya publica `CompassView.onAlignedChange`. El iPhone **no** calcula nada nuevo.
- **FR-003**: Emisión con `sendMessage` (sin respuesta) mientras el reloj está alcanzable, solo cuando cambia algo visible: |ΔΔ| ≥ 0.5°, Δ redondeado distinto, cambio de `aligned`, de estado, de tolerancia, de precisión redondeada o de aviso magnético. Máximo 5 mensajes/s; latido cada 1 s si nada cambia.
- **FR-004**: Además, `updateApplicationContext` con el último estado como mucho 1 vez/s, para que el reloj lo tenga al abrir aunque no estuviera alcanzable.
- **FR-005**: Al desaparecer `AimView` o pasar la app a segundo plano: un estado `idle` inmediato.
- **FR-006**: Responder a la petición `snapshot` del reloj con el estado actual (o `idle`).
- **FR-007**: Ningún cambio de comportamiento en la app iOS: mismas pantallas, textos y tiempos. El puente no bloquea el hilo principal ni el ciclo de pings.

### Functional Requirements — reloj

- **FR-010**: App de watchOS (un solo target, ciclo de vida SwiftUI) con destino watchOS 8.0, incluida en la app iOS (`WKRunsIndependentlyOfCompanionApp = false`). Nombre visible "MeshAzimuth". Mismo ícono adaptado al reloj.
- **FR-011**: Pantalla única según `contracts/watch-ui.md`: nombre (1 línea, truncado), brújula simplificada (anillo, marca superior fija del boom, cuña de ±max(tolerancia, 1)°, aguja girada Δ), instrucción ("Gira N°" con `arrow.clockwise`/`arrow.counterclockwise`, o "Alineado" con `checkmark.circle.fill`), azimut, y en US3 distancia y precisión.
- **FR-012**: Háptica al entrar en "Alineado": `WKInterfaceDevice.current().play(.success)` y luego `.click` cada 0.5 s hasta 3 s en total, que es el equivalente en el reloj del patrón de 3 s del iPhone (`Haptics.swift`). Se cancela al salir del estado alineado. Sin háptica en ningún otro estado.
- **FR-013**: Estados de US2 con sus textos exactos; datos desactualizados a los 3 s sin mensajes.
- **FR-014**: Al activarse (muñeca arriba o apertura): leer `receivedApplicationContext` y pedir `snapshot` si el iPhone está alcanzable.
- **FR-015**: Colores `Theme` (`navy`, `accent`, `target`) y verde/rojo del sistema; fondo negro (watchOS); tipografía del sistema del reloj.
- **FR-016**: La primera vez, una pantalla de una línea: "La brújula sigue al iPhone sobre el boom, no a tu muñeca.", con el botón "Entendido". Se guarda en `UserDefaults` del reloj (`watch.intro.done`).
- **FR-017**: Accesibilidad: la brújula expone el mismo texto que `CompassView.accessibilityText` ("Gira N grados a la derecha/izquierda" / "Alineado con el repetidor, azimut N grados").

### Functional Requirements — compartido

- **FR-020**: `WatchPayload.swift` (codificar y decodificar el estado, sin dependencias de UI) y `Geo.swift` se compilan en **ambos** targets. El formato del reloj usa las mismas funciones que el iPhone (`Geo.cardinal`, `String(format:)` de `AimInfo.distanceText` y de `AimView`).
- **FR-021**: Protocolo versionado `v = 1` según `contracts/watch-message.md`. Un reloj que recibe un `v` mayor muestra "Actualiza la app del reloj".

### Key Entities

- **WatchAimState**: `v`, `seq`, `state` (`idle` | `noLocation` | `noHeading` | `ok`), `name`, `bearing`, `delta`, `aligned`, `tolerance`, `distance`, `accuracy`, `magnetic`, `t` (instante de envío).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Latencia de pantalla iPhone → reloj ≤ 500 ms en el p95 con el iPhone a < 2 m (medida con un giro brusco y vídeo a 60 fps de ambas pantallas).
- **SC-002**: Los valores del reloj coinciden con los del iPhone en el 100 % de 20 capturas simultáneas (Δ redondeado, azimut, distancia, estado).
- **SC-003**: Con la muñeca arriba, el estado aparece en ≤ 1 s (US2-AS6).
- **SC-004**: Datos viejos señalados en ≤ 3 s tras cortar la comunicación; cero casos de "Alineado" mostrado sin un mensaje reciente que lo confirme.
- **SC-005**: Fluidez en el Series 3: sin tirones perceptibles con 5 actualizaciones/s; CPU media de la app del reloj < 30 % durante 2 min (Instruments).
- **SC-006**: En la app iOS, los tests existentes (46) siguen en verde y el tiempo por ping del banco no cambia (≈ 1.4 s).

## Assumptions

- El iPhone de referencia es el de las capturas (iOS 26); el reloj es un Series 3 en watchOS 8.8.1.
- **Fuera de alcance** (es una versión "lite"): métricas del pinger (SNR, RSSI, pérdida) en el reloj, "Medir aquí" desde el reloj, mapa, lista de repetidores, ajustes de tolerancia desde la Digital Crown, complicaciones, notificaciones, sesiones de ejecución extendida (`WKExtendedRuntimeSession` no tiene un tipo de sesión aplicable a este uso) y cualquier uso de sensores del reloj.
- Port Android (spec 004): el Apple Watch no se empareja con Android. Cuando 004 suba su commit de referencia por encima de esta feature, `WatchBridge` y el target del reloj se marcan en su matriz de paridad como "no aplica (exclusivo de watchOS)".

## Decisiones asumidas

Igual que en la 004, las decisiones que el código no resuelve se toman y se registran aquí; cualquiera se puede revertir antes de implementar.

| ID | Tema | Decisión |
|---|---|---|
| D-1 | Qué hace "lite" | Solo la brújula de apuntamiento (US1–US3). Sin pinger, mapa ni sesiones |
| D-2 | Fuente del rumbo | El iPhone (el reloj no tiene magnetómetro) |
| D-3 | Quién decide "Alineado" | El iPhone (con su histéresis); el reloj no recalcula |
| D-4 | Háptica | `.success` + `.click` cada 0.5 s hasta 3 s |
| D-5 | Mantener la app viva con la muñeca abajo | No (no hay un tipo de sesión extendida legítimo); se recomienda al usuario el ajuste del reloj "Volver a la app" |
| D-6 | Dibujo de la brújula | Simplificado: sin marcas ni números; la aguja gira Δ y no hay dial giratorio |
