# Feature Specification: Port de MeshAzimuth a React Native (Android), traspaso directo y pixel perfect

**Feature Branch**: `004-react-native-android`

**Created**: 2026-10-14

**Status**: Clarified (2026-10-14)

**Input**: User description: "La aplicación de esta sesión ya fue escrita, validada y probada (pinger firmware incluido). Tu tarea es convertirla a React Native (pixel perfect y como target Android). URL: http://github.com/120m4n/YagiAim. Tu tarea es escribir la spec kit de conversión. Nada de adivinar ni crear nuevas funcionalidades. Se debe traspasar directamente."

## Referencia y alcance

- **Fuente de verdad**: la app iOS de `120m4n/YagiAim` @ `2eda6d9` (2026-10-14): 31 archivos Swift en `MeshAzimuth/`, 4 suites XCTest (46 tests) y 5 archivos de fixtures en `MeshAzimuthTests/Fixtures/lines`.
- **Contratos vigentes que el port consume sin cambios**:
  - `specs/001-trace-pinger-firmware/contracts/line-protocol.md` (protocolo `proto=1`)
  - `specs/003-ble-nus-yagiaim-link/contracts/ble-nus-gatt.md` (GATT NUS)
  - `specs/003-ble-nus-yagiaim-link/contracts/session-csv.md` (CSV)
  - `specs/002-trace-frame-host-tests/contracts/fixture-format.md` (fixtures)
- **No cambia**: el firmware del pinger (repo MeshCore-HJ7RMN, `examples/trace_pinger`), el protocolo, la app iOS. El port es un cliente más del mismo pinger.
- **Regla de esta feature** (Constitución VII): cada comportamiento del port tiene una línea de origen en Swift. Las funciones, textos, reglas, tiempos, formatos y persistencia se traspasan tal cual. Si Android no permite hacer algo igual, la divergencia se registra en `contracts/platform-mapping.md` con su causa y la decisión tomada (ver **Clarifications**, sesión 2026-10-14).

### Fuera de alcance

- Funciones nuevas de cualquier tipo, incluidas las "naturales" en Android (botón atrás que haga algo distinto a cerrar, widgets, modo apaisado, tablets, modo background, notificaciones, localización a otros idiomas).
- Cambios en la app iOS, sin excepciones (incluidas herramientas de prueba o de captura). Cuando la falta de algo en iOS impide verificar en igualdad, se registra la divergencia y se aplica la decisión tomada (sesión de clarificación del 2026-10-14).
- Cambios en el firmware o en los contratos 001–003.
- Un build para iOS desde React Native.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Núcleo de dominio con paridad verificable (Priority: P1) 🎯 MVP

Como mantenedor, quiero que la lógica pura de la app (geodesia, protocolo de líneas, reensamblado, reglas de lecturas, CSV y formateo de números y fechas) exista en TypeScript y pase **los mismos 46 tests y los mismos fixtures** que la versión Swift, sin tocar sus expectativas.

**Why this priority**: Todo lo demás descansa en estos cálculos. Es la parte más barata de verificar y la que más errores silenciosos puede introducir: redondeo de `printf` frente a `toFixed`, parseo de números, medias circulares.

**Independent Test**: `npm test -- core` sin dispositivo ni emulador: 46/46 tests portados en verde, más los tests de semántica de formato de `contracts/format-semantics.md`.

**Acceptance Scenarios**:

1. **Given** los 5 archivos de `MeshAzimuthTests/Fixtures/lines`, **When** se ejecuta `LineCodec.test.ts`, **Then** cada línea produce el mismo evento que en `LineCodecTests.swift`, incluidos los rechazos (`.unknown`).
2. **Given** las suites `GeoTests`, `SessionRulesTests` y `SessionCSVTests`, **When** se portan una a una (mismo nombre de caso, mismos valores y tolerancias), **Then** pasan sin modificar expectativas.
3. **Given** `formatC("%.2f", 0.125)`, `formatC("%+.2f", -0.0)` y `formatC("%.1f", 61.25)`, **When** se evalúan, **Then** devuelven `"0.12"`, `"-0.00"` y `"61.2"` (semántica de `String(format:)`/printf, no la de `toFixed`).
4. **Given** una sesión de ejemplo, **When** se genera el CSV en Android y en iOS con la misma zona horaria, **Then** los dos archivos son idénticos byte a byte.

---

### User Story 2 - Mapa y repetidores (Priority: P1)

Como usuario, abro la app en Android y veo el mismo mapa, la misma barra superior, el mismo panel inferior con azimut y distancia, y la misma gestión de repetidores (alta tocando el mapa, lista con búsqueda y orden, editor con prefijo hash, importar/exportar JSON) que en iOS.

**Why this priority**: Es la pantalla de entrada y la mitad del valor de la app (apuntar sin pinger).

**Independent Test**: Con un repetidor importado desde el JSON exportado por la app iOS, Android muestra el mismo azimut y distancia que iOS desde el mismo punto (±0.1° / ±1 m), y la captura de la pantalla de mapa cumple `contracts/visual-acceptance.md` en las zonas no-mapa.

**Acceptance Scenarios**:

1. **Given** el primer arranque (sin `onboarding.done`), **When** abre la app, **Then** ve la guía de 3 páginas a pantalla completa, no descartable por gesto ("Siguiente"/"Empezar"), y al terminar no vuelve a verla. Se puede revisar desde *Acerca de → Ver guía de uso* (`OnboardingView.swift`, `ContentView.swift` L100–102).
2. **Given** el mapa, **When** el usuario hace un toque simple (no doble toque, no sobre un marcador ni un control), **Then** se abre el editor "Nuevo repetidor" con nombre `Repetidor N+1` y las coordenadas del toque (`MapView.swift` L64–70, L143–155; `ContentView.swift` L87–96).
3. **Given** un archivo `MeshAzimuth-repetidores.json` exportado por iOS, **When** se importa en Android, **Then** se fusiona con la misma regla (omite inválidos y duplicados por id, o por nombre y coordenadas) y muestra `Importados N. Omitidos M (duplicados o inválidos).` (`RepeaterStore.swift` L65–77, `RepeaterViews.swift` L113–123). A la inversa, lo exportado en Android se importa en iOS.
4. **Given** sin red, **When** se muestra el mapa, **Then** aparece la cápsula "Sin conexión: el mapa puede no cargar" y el mapa estándar sirve las teselas de caché aunque estén vencidas (`MapView.swift` L23–34).
5. **Given** un permiso de ubicación denegado, **When** se muestra el mapa o el apuntamiento, **Then** aparece el aviso "Sin permiso de ubicación" con "Abrir Ajustes" (`PermissionBanner.swift`).
6. **Given** que la app se cerró viendo una región, **When** se reabre, **Then** se restaura esa región sin seguimiento. Si no hay región guardada, arranca siguiendo al usuario (`ContentView.swift` L10, L18–26, L39–43).
7. **Given** una ubicación guardada de la sesión anterior y aún sin fix, **When** se muestra el panel, **Then** la distancia lleva el sufijo " · ubicación anterior" (`LocationManager.swift` L45–52, `ContentView.swift` L119).

---

### User Story 3 - Apuntamiento con brújula, inclinación y calibración (Priority: P1)

Como usuario, en la pantalla de apuntamiento de Android veo la misma brújula, la instrucción "Gira N°"/"Alineado", la tabla de datos, la tolerancia, la calibración del boom y la vibración sostenida al alinear, con los mismos números que iOS para la misma orientación física.

**Why this priority**: Es la función central de la app.

**Independent Test**: El teléfono Android y un iPhone, plano uno junto al otro sobre la misma regla, alineada con un objetivo de azimut conocido: el "Rumbo teléfono" difiere ≤ 2° y la instrucción coincide. La captura de la pantalla con sensores simulados cumple la aceptación visual.

**Acceptance Scenarios**:

1. **Given** un rumbo y un azimut, **When** |Δ| ≤ tolerancia, **Then** el dial se pone verde, la vibración sostenida dura 3 s y la instrucción dice "Alineado". Se sale del estado alineado solo con |Δ| > tolerancia + 2° (histéresis, `Geo.swift` L42–47, `CompassView.swift` L18–21, L56–61, `Haptics.swift`).
2. **Given** "Calibrar boom" confirmado, **When** la Yagi apunta al repetidor, **Then** el offset queda en `signedDelta(azimut, rumbo crudo)`, se persiste en `boom.offset` y aparece "Restablecer (±X.X°)" (`LocationManager.swift` L75–79, `AimView.swift` L60–78).
3. **Given** un repetidor con altitud y GPS con precisión vertical válida, **When** hay lectura de inclinación, **Then** se muestran "Elevación objetivo", "Inclinación boom" y "Ajuste vertical: Sube/Baja X.X°". La inclinación es positiva cuando el frente sube (`MotionManager.swift` L4–5, `AimView.swift` L33–39).
4. **Given** la pantalla de apuntamiento abierta, **When** pasa el tiempo, **Then** la pantalla no se apaga. Al salir se reactiva el apagado, se detiene la inclinación y se desconecta el pinger (`AimView.swift` L96–97).
5. **Given** sin fix de GPS, **When** hay brújula, **Then** se usa el norte magnético y se muestra "Usando norte magnético (sin GPS). Declinación no corregida." (`LocationManager.swift` L118–127, `AimView.swift` L49–52).

---

### User Story 4 - Pinger BLE y enlace en vivo (Priority: P1)

Como usuario, conecto el mismo pinger `YagiPinger-XXXX` desde Android, veo SNR↑, SNR↓, RSSI, RTT, pérdida y la gráfica en vivo, con el mismo handshake, cadencia, reconexión y mensajes de error que iOS.

**Why this priority**: Es la otra mitad del valor (medir), e interactúa con hardware real ya validado.

**Independent Test**: Con el pinger del banco (repetidor `4F`) se repite en Android la tabla "Valores medidos en banco" del README: conexión, tiempo por ping, SNR, RSSI, RTT y pérdida dentro de los márgenes de SC-006.

**Acceptance Scenarios**:

1. **Given** el selector abierto, **When** hay pingers anunciando, **Then** se listan los `YagiPinger-*` ordenados por nombre y se marca "último usado". A los 10 s sin resultados aparece "No se encontró ningún pinger…" y "Buscar de nuevo" (`PingerPicker.swift`).
2. **Given** un pinger elegido, **When** conecta, **Then** la app envía en orden `HELLO` (exige `proto=1`), `STOP`, `MON off`, `CFG?` y `SET hash=<H>` si hay hash, con un solo comando en vuelo y 6 s de timeout por petición (`PingerLink.swift` L76–123, L202–219).
3. **Given** "En vivo" activo, **When** corre, **Then** envía un `PING` al terminar el anterior, con un intervalo entre inicios de `max(2000 ms, rate)`. `!ERR` y "petición en curso" no lo detienen; cualquier otro error sí (`PingerLink.swift` L146–172).
4. **Given** una pérdida de conexión, **When** se quería el enlace, **Then** reintenta con esperas de 1, 2 y 4 s (tope 4 s), rehace el handshake y retoma "En vivo" si estaba activo. Un `proto` incompatible corta los reintentos (`PingerLink.swift` L252–289).
5. **Given** Bluetooth apagado o sin permiso, **When** se intenta escanear o conectar, **Then** se muestra el mensaje exacto de `LinkError.message` con "Abrir Ajustes", nunca un spinner infinito (`LineTransport.swift` L19–43).
6. **Given** *Acerca de → Pinger simulado* activo, **When** se conecta, **Then** el pinger simulado produce la misma secuencia de líneas que el `SimulatedPinger.swift` con la misma semilla y entradas (RNG SplitMix64 de 64 bits, tiempos, duty cycle, patrón Yagi).
7. **Given** que la app pasa a segundo plano en el apuntamiento, **When** ocurre, **Then** se detiene "En vivo" (`AimView.swift` L98).

---

### User Story 5 - Medición, sesiones y exportación (Priority: P2)

Como usuario, toco "Medir aquí", obtengo la misma lectura (Δ, mediana SNR↑, pérdida, "Repetir") con las mismas reglas, veo la sesión actual y las anteriores, y exporto el CSV con la hoja de compartir de Android.

**Why this priority**: Depende de US1, US3 y US4.

**Independent Test**: Con el pinger simulado (semilla fija) y sensores simulados, una medición de 5 pings genera en Android la misma `Reading` y las mismas filas CSV (salvo `session_id` y los instantes) que el mismo guion en iOS.

**Acceptance Scenarios**:

1. **Given** las condiciones de `SessionRecorder.measureHere` (enlace operativo, hash, brújula válida ≤ 15°, ubicación), **When** se mide, **Then** se pausan los pings en vivo, se envían 5 `PING` separados por `max(2000 ms, rate)` y se guarda el rumbo al enviar (callback `onSent`) y al recibir. Al terminar se retoma "En vivo" (`SessionRecorder.swift` L31–78).
2. **Given** muestras con movimiento > 2°, con `#WARN duty_wait`, `timeout` o `busy`, **When** se resume la lectura, **Then** se aplican exactamente `SessionRules.makeReading` y `makeSample` (`SessionModels.swift` L49–87).
3. **Given** una sesión, **When** se exporta, **Then** el archivo se llama `meshazimuth_<nombre-seguro>_<yyyyMMdd-HHmmss>.csv` y su contenido cumple `session-csv.md` con fin de línea `\r\n` (`SessionCSV.swift`).
4. **Given** sesiones guardadas, **When** se abre "Sesión", **Then** se listan la actual y las "Anteriores" del repetidor, de la más reciente a la más antigua. Las corruptas se omiten (`SessionStore.swift`, `SessionView.swift`).

---

### User Story 6 - Aceptación visual pixel perfect (Priority: P2)

Como dueño del producto, quiero una suite automática que compare cada pantalla y estado de Android con su captura de referencia de iPhone, con umbrales escritos, para decidir con datos si el port es "pixel perfect".

**Why this priority**: Es el criterio de aceptación que pidió el usuario. Se construye en paralelo a US2–US5 y las bloquea al final.

**Independent Test**: `npm run visual` en el AVD de referencia (1290×2796 px, 480 dpi = 430×932 dp, el mismo tamaño lógico que el iPhone de las capturas) produce un informe con métricas por pantalla y el veredicto según `contracts/visual-acceptance.md`: comparación contra iOS en los estados con captura y regresión contra la línea base aprobada en el resto.

**Acceptance Scenarios**:

1. **Given** las capturas de `docs/img` (12 imágenes, 11 estados), **When** corre la suite con los valores de cada captura inyectados en Android, **Then** cada pantalla se compara en sRGB (referencias convertidas de Display P3) con máscaras para las barras del sistema, las teselas de mapa y la fecha (capturada en otra región), aplicando el criterio de C-10.
2. **Given** una pantalla que supera el umbral, **When** se informa, **Then** el informe incluye la imagen de diferencias y la zona afectada.

### Edge Cases

- **Interoperabilidad de identificadores**: Swift genera UUID en mayúsculas (`uuidString`). Los ids nuevos en Android DEBEN ir también en mayúsculas para que la deduplicación de la importación funcione entre plataformas.
- **Identificador del pinger**: en iOS es un UUID de CoreBluetooth; en Android es la dirección MAC. `pinger.lastDevice` guarda el identificador nativo de cada plataforma (no son intercambiables y no tienen que serlo).
- **Altitud**: iOS reporta altitud sobre el nivel medio del mar; Android, sobre el elipsoide WGS84. Sin convertir, la elevación al repetidor (altitud en "m s.n.m.") tendría un error igual a la ondulación del geoide (decenas de metros en Colombia). Ver `platform-mapping.md` PM-08.
- **Línea de más de 160 B, UTF-8 partido entre notificaciones, `\r\n`**: igual que `LineAssembler` (tests portados).
- **MTU**: Android arranca con 23 B (20 útiles). El port negocia MTU para igualar el comportamiento automático de iOS, y la fragmentación por `\n` sigue funcionando con cualquier MTU (PM-12).
- **Animación de la brújula al cruzar el norte**: iOS desenrolla el rumbo y el delta de la aguja con `Geo.unwrap` (commit `464ffaf`), así que de 359° a 1° y de 179° a −179° gira por el camino corto. El port hace lo mismo con `unwrapAngle` (C-7).
- **Tamaño de texto del sistema**: la aceptación visual se mide con escala 1.0 (iOS "Large"). Con otras escalas el texto crece como en iOS, sin compromiso de pixel perfect.

## Requirements *(mandatory)*

Cada FR cita su origen. "Igual que" significa mismo texto, mismos valores, mismos tiempos y mismo formato.

### Functional Requirements — núcleo (US1)

- **FR-001**: `geo.ts` DEBE implementar `bearing`, `distance` (R = 6 371 008.8 m), `elevation` (k = 4/3, `d ≤ 1 → 0`), `signedDelta` en (−180, 180], `isAligned` (margen de salida 2), `normalize` (nunca 360), `circularMean` (nil si `hypot < 1e-9`), `median` (par = promedio de los centrales, sin mutar la entrada) y `cardinal` con los 16 rumbos en español (`Geo.swift`).
- **FR-002**: `lineCodec.ts` DEBE reproducir `LineCodec.parse` y sus reglas de validación: `uint` estricto (solo dígitos ASCII), `number` con la gramática de `Double(String)` de Swift y rechazo de no finitos, hex ASCII, tag de 8 hex en mayúsculas, `split` con y sin vacíos según cada caso, `keyValues` y `codeAndDetail` (`LineCodec.swift` L50–158; `contracts/format-semantics.md` FS-02…FS-05).
- **FR-003**: `lineAssembler.ts` DEBE reproducir `LineAssembler`: bytes, `\n` como separador, `\r` final opcional, líneas vacías ignoradas, tope de 160 B con descarte hasta el siguiente `\n`, `overflowCount` y decodificación UTF-8 solo al cerrar la línea (`LineCodec.swift` L160–200).
- **FR-004**: `sessionRules.ts` DEBE reproducir `SessionRules` (umbral 2.0° exclusivo, mínimo 3 estables, precisión ≤ 15°, pérdida = timeouts/(ok+timeouts) redondeada, `meanDelta` como media circular normalizada a (−180, 180]) (`SessionModels.swift` L49–87).
- **FR-005**: `sessionCsv.ts` DEBE reproducir `SessionCSV` (cabecera de 31 columnas, formatos con `formatC`, ISO 8601 con milisegundos y offset local, nombre de archivo con `en_US_POSIX`, `escape` RFC 4180, `\r\n` también tras la última fila) (`SessionCSV.swift`).
- **FR-006**: `formatC(spec, value)` DEBE reproducir `String(format:)` para los especificadores que usa la app (`%.Nf`, `%+.Nf`, `%08X`, `%d`/`%@` en interpolaciones), con redondeo sobre el valor binario exacto y empate a par, y el signo de −0.0. Se prohíbe `toFixed` en el código de producción (FS-01).
- **FR-007**: Los 46 tests XCTest DEBEN portarse 1:1 a Jest (mismo nombre de caso en camelCase, mismos datos, mismas tolerancias). Se consumen los fixtures directamente de `MeshAzimuthTests/Fixtures/lines` (sin copia), para que `tools/sync_fixtures.sh` siga siendo la única sincronización.

### Functional Requirements — mapa, repetidores y app (US2)

- **FR-010**: El modelo `Repeater` y su persistencia DEBEN replicar `Repeater`/`RepeaterStore`: claves `repeaters.v1` (JSON) y `repeaters.selected`; `add` selecciona; `delete` reselecciona el primero; `merge` con la misma regla; `normalizedHashPrefix` (`RepeaterStore.swift`).
- **FR-011**: El JSON de repetidores (persistido y exportado) DEBE ser compatible en ambos sentidos con el `JSONEncoder` de Swift. La exportación usa `prettyPrinted` + `sortedKeys` con el mismo nombre de archivo (`MeshAzimuth-repetidores.json`) y omite los opcionales nil (`storage-and-files.md` SF-03).
- **FR-012**: El mapa DEBE ofrecer los dos estilos (estándar con teselas OSM y satélite con etiquetas), conmutados con el botón de la barra izquierda y persistidos en `map.satellite`. Estándar: plantilla `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, zoom máximo 19, `User-Agent: MeshAzimuth/1.0 (co.electrosoftware.meshazimuth)`, caché pasiva en disco de 500 MB (memoria 20 MB) que sirve teselas vencidas sin red, sin prefetch, y atribución "© OpenStreetMap contributors" abajo a la izquierda. Satélite: teselas **EOX Sentinel-2 cloudless** (WMTS público, sin API key ni pago) con la atribución exigida por su licencia, y encima etiquetas y vías **vectoriales de OpenFreeMap** (esquema OpenMapTiles, datos OSM; sin registro, sin API key, uso comercial permitido) (PM-02). Motor: **MapLibre React Native** (C-3).
- **FR-013**: Marcadores, línea y controles del mapa DEBEN replicar `MapView.swift`: marcador tipo globo con el glifo de antena, naranja (`target`) si está seleccionado y azul (`accent`) si no; tocar un marcador lo selecciona sin dejarlo seleccionado en el mapa; línea usuario → repetidor con contorno blanco 95 % de 8 px y extremo redondeado, más trazo naranja de 4 px con discontinuidad [12, 8] y extremo plano, por encima de las etiquetas; brújula adaptativa a 60 pt bajo el área segura y 12 pt del borde derecho; escala visible a 8/8 pt arriba a la izquierda; punto de ubicación del usuario.
- **FR-014**: El botón de seguimiento DEBE replicar `TrackingButton.swift`: ciclo sin seguir → seguir → seguir con rumbo → seguir; vuelve a "sin seguir" al arrastrar; mismos íconos, colores, tamaño de 44×44, radio de 10 y etiquetas de accesibilidad.
- **FR-015**: La región visible DEBE persistirse en `map.camera` como `[lat, lon, latDelta, lonDelta]` en cada cambio y validarse al leerla igual que `savedRegion()`.
- **FR-016**: Barra superior, panel inferior, cápsula sin repetidor, banners de red y de permiso, *Acerca de*, guía y lista/editor de repetidores DEBEN replicar textos, estructura y estilos de `ContentView.swift`, `PermissionBanner.swift`, `NetworkMonitor.swift`, `AboutView.swift`, `OnboardingView.swift` y `RepeaterViews.swift`, según `contracts/ui-spec.md`. Incluye búsqueda insensible a mayúsculas (`localizedCaseInsensitiveContains`), orden por cercanía o por nombre (`list.sortByDistance`, por defecto cercanía), deslizar a la derecha para borrar (deslizamiento completo) y a la izquierda para editar, y el menú "…" con orden, importar y exportar.
- **FR-017**: *Acerca de* DEBE mostrar versión `1.0 (1)`, tamaño de la caché de mapas (formato de `ByteCountFormatter` `.file`), "Borrar caché de mapas" con confirmación, el interruptor "Pinger simulado" (`pinger.simulated`), indicativo HJ7RMN y los dos enlaces externos.
- **FR-018**: El estado de conectividad DEBE equivaler a `NWPath.status == .satisfied` (hay una ruta de red utilizable), no a "Internet verificado".

### Functional Requirements — sensores y apuntamiento (US3)

- **FR-020**: El proveedor de ubicación DEBE dar la mejor precisión disponible con filtro de distancia de 2 m. Solo acepta fixes con precisión horizontal ≥ 0 y persiste la última ubicación en `location.last` (claves `lat, lon, alt, h, v, t`) como mucho cada 5 s. Al arrancar la restaura y marca `isCachedLocation` (`LocationManager.swift`).
- **FR-021**: La altitud DEBE expresarse sobre el nivel medio del mar, como `CLLocation.altitude`. La precisión vertical "no válida" (< 0 en iOS) se representa igual (PM-08).
- **FR-022**: El rumbo DEBE ser verdadero (declinación corregida con el modelo geomagnético y la ubicación). Sin ubicación usa el magnético y activa `usingMagneticFallback`. Se suaviza con EMA α = 0.25 sobre seno/coseno, con filtro de 0.5° y referido al borde superior del teléfono en vertical (`portrait`), plano sobre el boom (PM-05, PM-06).
- **FR-023**: La precisión del rumbo DEBE expresarse en grados, como `CLHeading.headingAccuracy` (negativo = no válida), porque de ella dependen el texto "Precisión brújula", la regla de 15° y el bloqueo de "Medir aquí". Fuente, en este orden: **Fused Orientation Provider** de Google Play Services (`DeviceOrientation.headingErrorDegrees`); sin FOP (sin giroscopio o sin Play Services), `values[4]` de `TYPE_ROTATION_VECTOR`; sin ese sensor, `TYPE_GEOMAGNETIC_ROTATION_VECTOR` (acelerómetro + magnetómetro) o el cálculo propio con `getRotationMatrix`, con `values[4]` si existe o, si no, la desviación estándar circular del rumbo en los últimos 2 s. Un teléfono sin giroscopio pero con magnetómetro DEBE poder medir. `-1` ("sin calibrar", que bloquea "Medir aquí" igual que en iOS) solo cuando el magnetómetro no es fiable (`SENSOR_STATUS_UNRELIABLE`) o no existe (C-5, PM-05).
- **FR-024**: El offset del boom DEBE persistirse en `boom.offset` y `heading = normalize(raw + offset)` (`LocationManager.swift` L17–21).
- **FR-025**: La inclinación DEBE ser el pitch de la orientación del dispositivo en grados, positivo cuando el frente sube, a 10 Hz con EMA α = 0.3. Solo se mide con la pantalla de apuntamiento visible y se borra al detenerse (`MotionManager.swift`, PM-07).
- **FR-026**: La vibración al alinear DEBE equivaler a `Haptics.startAligned(3 s)`: continua de intensidad 0.8 más golpes de intensidad 1.0 cada 0.5 s, cancelable con `stop()`, sin reentrar mientras está activa. Sin vibrador con control de amplitud se usa el equivalente de `notificationOccurred(.success)` (PM-10).
- **FR-027**: La brújula DEBE replicar `CompassView.swift`: geometría (72 marcas, mayores cada 45°, medias cada 15°, etiquetas N/E/S/O con N en rojo, números 30…330), aguja, triángulo fijo, cuña del haz de ±max(tolerancia, 1)° al 18 % de opacidad, colores verde/target/primary, animación easeOut de 0.15 s y etiqueta de accesibilidad.
- **FR-028**: La pantalla de apuntamiento DEBE replicar `AimView.swift`: orden de bloques, filas de la tabla y sus formatos, tolerancia 1–15 con paso 1 persistida en `tolerance` (por defecto 3), diálogo de calibración con sus textos, transición numérica de "Gira N°", pantalla siempre encendida y `link.disconnect()` al salir.

### Functional Requirements — pinger (US4)

- **FR-030**: `LineTransport` (interfaz), `LinkState` y `LinkError` (con los mismos mensajes y la misma regla de `opensSettings`), y `PingerDevice` DEBEN replicar `LineTransport.swift`.
- **FR-031**: `BleLineTransport` DEBE replicar `BLELineTransport.swift` sobre el contrato `ble-nus-gatt.md`:
  - escaneo por servicio NUS con prefijo de nombre `YagiPinger-` y lista ordenada por nombre;
  - conexión al dispositivo elegido, al último usado o al primero que aparezca;
  - timeout de apertura de 10 s (`deviceNotFound` si no vio ninguno, `timeout` si no);
  - suscripción a TX, guardado de `pinger.lastDevice` al quedar listo;
  - escritura sin respuesta fragmentada por el tamaño máximo de escritura (mínimo 20 B), en orden y sin pérdidas;
  - detección de desconexión → `failed(connectionLost)`;
  - Bluetooth apagado o sin permiso → `bluetoothOff`/`unauthorized`.
- **FR-032**: `PingerLink` DEBE replicar `PingerLink.swift`: estado observable (`state`, `device`, `config`, `last`, `history` de 30, `live`, `lastWarning`, `hash`), `isOperational`, `connect`, `disconnect`, `configure(hash)`, handshake, `ping(onSent)` con `PingReport` (`tTx` justo tras escribir, `tRx` al recibir, `dutyWait`), un solo `Waiter` en vuelo, timeout de 6 s, "En vivo" y reconexión.
- **FR-033**: `SimulatedPinger` DEBE replicar `SimulatedPinger.swift`:
  - respuestas a cada comando y config simulada (`915.800/250/10/5/22`, `rate=1500`);
  - `busy`/`nohash`;
  - duty cycle del 10 % en 60 s con `#WARN duty_wait`;
  - ToA de 177 ms + ventana de 1207 ms, apertura de 300 ms;
  - SplitMix64 con aritmética de 64 bits exacta, Box-Muller, cuantización hacia cero a 0.25 dB, patrón `yagiGain` (n = 8, F/B = 12 dB), `snr0 = 8`, σ = 0.75, pérdida del 5 %;
  - formato de la línea `P,` con `formatC`.
- **FR-034**: El selector y la tarjeta de enlace DEBEN replicar `PingerPicker.swift` y `LinkCard.swift`: estados, textos, fila del pinger simulado solo con el ajuste activo, timeout de búsqueda de 10 s, métricas y formatos, "En vivo · 1 ping cada 2 s", sparkline del SNR↑ con al menos 2 puntos, pérdida sobre los últimos 30 respondidos y solo los avisos `duty_wait`/`hash_collision`.
- **FR-035**: Permisos de Bluetooth y ubicación equivalentes a los textos de uso de iOS. Android no muestra un texto de propósito del sistema, así que no se añade ninguna pantalla nueva (PM-11).

### Functional Requirements — medición y sesiones (US5)

- **FR-040**: `SessionRecorder` DEBE replicar `SessionRecorder.swift`: errores `notReady`, `noHash`, `needsCalibration`, `noLocation` y `measuring` con sus textos de `PingerSection.swift`; `count = 5`; pausa y reanuda "En vivo"; `configure(hash)` si cambió; `target` calculado una vez; muestras omitidas ante `rejected` o `timeout`; guardado tras cada lectura.
- **FR-041**: `SessionStore` DEBE guardar un JSON por sesión en el almacenamiento privado de la app (`<filesDir>/Sessions/<UUID>.json`, equivalente a `Application Support/Sessions`), con escritura atómica, listado de la más reciente a la más antigua, filtro por repetidor y omisión de corruptos. El JSON DEBE ser el que produce `JSONEncoder` de Swift con `sortedKeys` (SF-04).
- **FR-042**: `SessionSheet`/`SessionView` DEBEN replicar textos, filas y formatos, incluida la fecha con el estilo de `Date.formatted(date: .abbreviated, time: .shortened)` según la configuración regional del dispositivo (FS-07), y "Exportar CSV" con la hoja de compartir del sistema (archivo temporal, `text/csv`).
- **FR-043**: Al terminar una medición DEBE darse la respuesta háptica equivalente a `.success` o `.warning` (con `needsRepeat`) (PM-10).

### Functional Requirements — plataforma y empaquetado

- **FR-050**: `applicationId` `co.electrosoftware.meshazimuth`, nombre visible "MeshAzimuth", `versionName 1.0`, `versionCode 1`, solo vertical, ícono a partir de `Assets.xcassets/AppIcon.appiconset/AppIcon.png`.
- **FR-051**: Requisitos de hardware equivalentes a `UIRequiredDeviceCapabilities` (brújula, ubicación, GPS) declarados como `uses-feature required="true"`. El Bluetooth LE se declara como no requerido, igual que en iOS, donde no figura en esa lista.
- **FR-052**: Arranque sin contenido propio, como el `UILaunchScreen` vacío de iOS (PM-15).
- **FR-053**: Ningún SDK de analítica, publicidad o red distinto de las teselas del mapa (`PRIVACY.md`). La sección de seguridad de datos de Play se redacta a partir de `PrivacyInfo.xcprivacy` y `PRIVACY.md`.

### Functional Requirements — aceptación visual (US6)

- **FR-060**: La UI DEBE construirse con componentes propios que reproduzcan los de iOS de las capturas (iOS 26), no con componentes Material: barra de navegación con botones en cápsula, hojas con esquinas superiores redondeadas, listas agrupadas, interruptor, deslizador, botones `borderedProminent`/`bordered`, diálogos de confirmación, menú, acciones por deslizamiento, búsqueda, vista de contenido vacío, indicador de actividad y paginador de la guía (`ui-spec.md`).
- **FR-061**: Tipografía: tamaños, interlineados y pesos de los estilos de texto de iOS en tamaño "Large", cifras tabulares donde Swift usa `monospacedDigit()` y variantes redondeada y monoespaciada donde las usa la brújula. Familias (C-2): **Inter** (OFL) para todo el texto, con cifras tabulares; las 4 letras de la brújula (N/E/S/O) como **trazos vectoriales propios** redondeados; los 8 números de la brújula en **JetBrains Mono** (OFL).
- **FR-062**: Iconografía: los 33 símbolos de `contracts/inventory/symbols.tsv` con el mismo tamaño, peso y color. Origen (C-1): **dibujo propio** de los 33 glifos sobre la base de Lucide (ISC) o Phosphor (MIT), ajustado en peso y proporción contra las capturas; prohibido calcar o derivar de los SF Symbols.
- **FR-063**: Colores: `Theme` (`#011949`, `#2E8CFF`, `#FF9E1A`) y los colores de sistema de iOS en modo claro y oscuro (`ui-spec.md`, tabla de colores, medida en las capturas tras convertirlas a sRGB). La app sigue el modo del sistema como iOS, con las mismas zonas forzadas a oscuro.
- **FR-064**: Materiales (`.regularMaterial`, `.thinMaterial`) y efectos "Liquid Glass" de iOS 26: como en la app todos van sobre fondos casi uniformes, se reproducen con **colores sólidos medidos** en las capturas más un borde de brillo donde iOS lo muestra; el desenfoque real se usa solo sobre el mapa (atribución OSM, aviso sin red) (C-4).
- **FR-065**: Suite visual según `visual-acceptance.md`: comparación contra las capturas iOS existentes reproduciendo en Android los valores que muestra cada una (inyección determinista solo en Android), conversión P3 → sRGB, máscaras y el criterio de C-10; los estados sin captura iOS usan una línea base Android aprobada por el dueño (C-8).

### Key Entities

Las mismas de Swift, con los mismos campos y significados (ver `data-model.md`): `Repeater`, `PingResult`, `BurstSummary`, `RawFrame`, `PingerEvent`, `LinkState`, `LinkError`, `PingerDevice`, `PingReport`, `RingBuffer`, `Sample`, `Reading`, `Session`, `SimInputs`, `AimInfo`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 46/46 tests XCTest portados en verde con sus expectativas originales, consumiendo los fixtures del repo sin copia.
- **SC-002**: 100 % de las líneas de los 5 archivos de fixtures producen el mismo evento en TypeScript que en Swift.
- **SC-003**: Para la sesión de ejemplo de `SessionCSVTests`, el CSV de Android es idéntico byte a byte al de iOS (zona `-05:00`). El JSON de repetidores exportado en un lado se importa en el otro con 0 omisiones.
- **SC-004**: Con el teléfono Android y el iPhone en la misma regla, "Rumbo teléfono" difiere ≤ 2° (mediana de 10 lecturas en 4 orientaciones), "Inclinación boom" ≤ 1° y "Elevación objetivo" ≤ 0.1° para el mismo repetidor y ubicación.
- **SC-005**: Con sensores y pinger simulados deterministas, los estados con captura iOS cumplen el criterio de C-10 frente a iOS, y el resto coincide con su línea base Android aprobada, en el AVD de referencia.
- **SC-006**: En banco (pinger a < 1 m, repetidor `4F`, 22 dBm), Android logra: conexión BLE ≤ 1.0 s (iOS ≈ 0.8 s), comando → resultado ≤ 1.6 s (iOS ≈ 1.4 s), 0 % de pérdida en 20 pings, y SNR/RSSI en los rangos de la tabla del README.
- **SC-007**: El pinger simulado con semilla 1 y las mismas entradas emite en Android la misma secuencia de tags y valores que en iOS (primeros 20 pings).
- **SC-008**: 0 divergencias sin registrar: cada fila de `contracts/parity-matrix.md` tiene estado "igual" o una entrada PM aprobada.

## Assumptions

- La app iOS en `2eda6d9` es correcta y completa. Si un test del port revela un defecto en Swift, se reporta y **no** se corrige en el port (se traspasa igual), salvo decisión explícita del dueño.
- Las capturas de `docs/img` son la única referencia visual de iOS. Se pueden añadir más capturas tomadas a mano en un iPhone (sin cambiar la app); la suite las incorpora si siguen el procedimiento de `visual-acceptance.md` VA-1.
- Reference device: las capturas miden 1290×2796 px (430×932 pt @3x), con perfil Display P3, en modo oscuro salvo la barra del mapa (forzada).
- El pinger y su firmware no cambian; Android es un central BLE más (el pinger acepta uno a la vez).

## Clarifications

### Session 2026-10-14

Regla general dada por el dueño: **no se añade nada a la app iOS; si hay divergencia, se asume la decisión** y se registra.

- Q: C-10 ¿Qué significa "pixel perfect" si fuente e íconos no pueden ser los de Apple? → A: **Estricto en geometría y color; flexible en la forma de los glifos.** Posición y tamaño de elementos ±1 dp, color ΔE2000 ≤ 2, cajas de texto (ancho ±2 %, alto y línea base ±1 dp); el interior de letras e íconos se excluye de la métrica de píxeles (`visual-acceptance.md` VA-6).
- Q: C-3 ¿Proveedor de satélite? → A: **Cualquiera libre, sin API key ni pago.** Se elige EOX Sentinel-2 cloudless **2016** (WMTS público, CC BY 4.0, sin restricción comercial) + etiquetas y vías vectoriales de OpenFreeMap; motor MapLibre RN. Divergencia aceptada: 10 m de resolución frente a la imagen submétrica de Apple (PM-02).
- Q: C-9 ¿Región? → A: **Español (Colombia), `es_CO`.** Las capturas iOS existentes muestran la fecha en otra región, así que la fecha se enmascara en ellas y se verifica por dorado (FS-07).
- Q: C-8 ¿Arnés de captura en iOS? → A: **No se añade nada a iOS.** La comparación contra iOS usa solo las capturas existentes (o nuevas tomadas a mano); el resto de estados, una línea base Android aprobada por el dueño.
- C-1, C-2, C-4, C-5, C-6, C-7, C-11: sin objeción a las recomendaciones del brainstorming; se aplican por la regla general:

| ID | Decisión |
|---|---|
| C-1 | Íconos propios sobre la base de Lucide/Phosphor, sin calcar SF Symbols |
| C-2 | Inter + N/E/S/O como trazos propios + JetBrains Mono para 30…330 |
| C-3 | MapLibre RN; estándar = OSM (mismas teselas que iOS); satélite = EOX Sentinel-2 cloudless 2016 (CC BY 4.0) + etiquetas/vías OpenFreeMap |
| C-4 | Colores sólidos medidos + borde de brillo; desenfoque solo sobre el mapa |
| C-5 | Fused Orientation Provider (grados) → vector de rotación 11 (`values[4]`) → vector geomagnético 20 → `getRotationMatrix` (1 + 2), con `values[4]` o desviación circular de 2 s → `-1` solo con magnetómetro no fiable o ausente (corregido el 2026-10-20: sin el tipo 20 un teléfono sin giroscopio quedaba en "sin calibrar") |
| C-6 | Sin diálogo de calibración del sistema (divergencia aceptada; los textos de la app ya avisan) |
| C-7 | Camino corto al cruzar 360°/0° y ±180°, igual que iOS desde `464ffaf` (`Geo.unwrap` = `unwrapAngle`); antes se replicaba la vuelta larga |
| C-8 | Sin cambios en iOS; capturas existentes + línea base Android aprobada |
| C-9 | `es_CO` |
| C-10 | Criterio de la primera pregunta (VA-6) |
| C-11 | `minSdk 26`, `targetSdk 35` |
