# Contrato: matriz de paridad Swift → React Native

Referencia: `120m4n/YagiAim@2eda6d9`. Destino: `android-rn/` (estructura en `plan.md`).

**Estado** de cada fila:
- `=`: se traspasa igual.
- `PM-xx`: divergencia registrada en `platform-mapping.md`.
- `C-x`: pendiente de clarificación en `spec.md`.

**Regla de revisión**: un PR que toca un módulo destino marca las filas que cubre y enlaza el test que lo prueba (unitario, de paridad o visual). SC-008 exige que ninguna fila quede sin estado.

## 1. Núcleo puro (`src/core/`) — sin React ni APIs nativas

| Origen Swift | Destino | Comportamientos que se traspasan | Estado | Prueba |
|---|---|---|---|---|
| `Geo.swift` | `core/geo.ts` | `bearing`, `distance` (R = 6 371 008.8), `elevation` (k = 4/3, d ≤ 1 → 0), `signedDelta` (−180, 180], `isAligned` (+2 de salida), `normalize` (≥ 360 → 0), `circularMean` (nil vacío / `hypot ≤ 1e-9`), `median` (par = promedio de los centrales, no muta), `cardinal` (16 nombres ES: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSO, SO, OSO, O, ONO, NO, NNO), `rad`/`deg` | = | `geo.test.ts` (12 casos de `GeoTests`) |
| `AimInfo.swift` | `core/aimInfo.ts` | nil sin ubicación; elevación solo si el repetidor tiene altitud y `verticalAccuracy ≥ 0`; `delta` solo con rumbo; `distanceText` (≥ 1000 → `%.2f km`, si no `%.0f m`) | = | `aimInfo.test.ts` (nuevo, de paridad) |
| `Link/LineCodec.swift` (L1–158) | `core/lineCodec.ts` | `PingResult`, `BurstSummary` (`busy` ausente = 0), `RawFrame` (sufijo `..` → `truncated`), `PingerEvent` (9 casos), `parse` con prefijos exactos (`P,`, `S,`, `R,`, `#HELLO `, `#CFG `, `#OK `, `#WARN `, `!ERR `), recorte de `\r\n` en ambos extremos, validaciones `uint`/`number`/`isHex` | = (FS-02…05) | `lineCodec.test.ts` (16 casos de `LineCodecTests`) |
| `Link/LineCodec.swift` (L160–200) | `core/lineAssembler.ts` | `maxLine = 160`, descarte por overflow, `overflowCount`, `\r` final, vacías ignoradas, decodificación UTF-8 al cerrar con reemplazo (`String(decoding:)`) | = (FS-06) | incluido en `lineCodec.test.ts` (6 casos) |
| `Session/SessionModels.swift` | `core/sessionModels.ts` | `Sample` (16 campos), `Reading` (10), `Session` (8), `SessionRules` (umbral 2.0 exclusivo, 3 estables, precisión 0…15, `makeSample`, `makeReading`) | = | `sessionRules.test.ts` (13 casos de `SessionRulesTests`) |
| `Session/SessionCSV.swift` | `core/sessionCsv.ts` | cabecera de 31 columnas, campos y formatos, `sample_idx` por lectura, ISO 8601 con fracción y zona, `\r\n` final, `fileName` (`en_US_POSIX`, `yyyyMMdd-HHmmss`, solo `[A-Za-z0-9-]` por grafema, si no `_`), `escape` RFC 4180 | = (FS-01, FS-07, FS-08) | `sessionCsv.test.ts` (5 casos de `SessionCSVTests`) |
| `Link/SimulatedPinger.swift` (`SplitMix64`) | `core/splitmix64.ts` | `next()` con aritmética de 64 bits envolvente (BigInt), `uniform()` = `(next >> 11) / 2^53`, `gaussian()` Box-Muller con `max(u1, 1e-12)` | = | `splitmix64.test.ts`: vectores dorados de la semilla 1 generados en Swift (tarea T012) |
| `SimulatedPinger.yagiGain` | `core/yagiGain.ts` | `10·log10(max(max(cos(δ/2), 0)^(2n), 10^(−FB/10)))`, n = 8, FB = 12 | = | `yagiGain.test.ts` |
| `String(format:)` (en todo el código) | `core/formatC.ts` | `%.Nf`, `%+.Nf`, `%08X` con semántica C | = (FS-01) | `formatC.test.ts` |
| `Repeater.normalizedHashPrefix` | `core/repeater.ts` | trim de espacios, mayúsculas, exactamente 2 hex ASCII | = | `repeater.test.ts` |
| `RepeaterStore.merge` | `core/repeater.ts` | válido (nombre no vacío, \|lat\| ≤ 90, \|lon\| ≤ 180), duplicado (id, o nombre + lat + lon iguales), conteo `(added, skipped)` | = | `repeater.test.ts` |
| Codable de Swift | `core/swiftJson.ts` | codificar y decodificar `Repeater`/`Session` con el formato de `JSONEncoder`/`JSONDecoder` por defecto (fechas como segundos desde 2001-01-01, UUID en mayúsculas, opcionales nil omitidos, `sortedKeys`) | = (SF-03, SF-04) | `swiftJson.test.ts` con JSON dorado producido por iOS (T013) |

## 2. Estado y servicios (`src/state/`, `src/link/`, `src/session/`)

| Origen Swift | Destino | Comportamientos | Estado | Prueba |
|---|---|---|---|---|
| `MeshAzimuthApp.swift` | `App.tsx` + `state/providers.tsx` | una instancia de cada servicio para toda la app (location, store, motion, link, recorder) inyectada por contexto; la factoría de transporte elige `SimulatedPinger` si `pinger.simulated` está activo **al conectar**, o BLE con el dispositivo elegido o el último; `SimInputs` compartido; `.tint(Theme.accent)` global | = | integración |
| `RepeaterStore.swift` | `state/repeaterStore.ts` | `repeaters` (guarda en cada cambio), `selectedID` (guarda en cada cambio, nil → borra), `selected`, `add`/`update`/`delete`/`merge`; carga en el arranque | = (SF-01) | `repeaterStore.test.ts` |
| `LocationManager.swift` | `state/locationStore.ts` + `native/HeadingModule.kt` | ver FR-020…FR-024: precisión, filtro de 2 m, `location.last` cada 5 s, `isCachedLocation`, `rawHeading` suavizado (α 0.25), `headingOffset` (`boom.offset`), `heading`, `headingAccuracy`, `authorization`, `usingMagneticFallback`, `calibrate(toBearing)`, `start`/`stop` | PM-04…PM-08, C-5, C-6 | unitario (suavizado) + campo (SC-004) |
| `LocationManager.updateOrientation` | — | no se llama desde ningún sitio en la referencia (la app es solo vertical) | = (no se porta código muerto; la orientación de rumbo queda fija en vertical) | — |
| `MotionManager.swift` | `state/motionStore.ts` + `HeadingModule.kt` | `pitch` en grados, 10 Hz, EMA 0.3, `start` no reentra, `stop` pone nil | PM-07 | campo (SC-004) |
| `NetworkMonitor.swift` | `state/networkStore.ts` | `isOnline` inicial true; equivalente a `.satisfied` | PM-13 | manual |
| `Haptics.swift` | `platform/haptics.ts` | `startAligned(3)` no reentrante, `stop()`, fallback `.success` | PM-10 | manual + unitario (temporizador) |
| `Link/LineTransport.swift` | `link/lineTransport.ts` | `LinkState` (5), `isReady`, `failure`, `LinkError` (7) con mensajes exactos, `opensSettings`, `PingerDevice`, interfaz `LineTransport` (`state`, `states`, `lines`, `open`, `close`, `send`) | = | `lineTransport.test.ts` (mensajes) |
| `Link/BLELineTransport.swift` | `link/bleLineTransport.ts` | UUID NUS, prefijo `YagiPinger-`, clave `pinger.lastDevice`, `openTimeout = 10`, `startScan`/`stopScan`/`select`/`open`/`close`/`send`, `devices` ordenados por nombre, informe de disponibilidad de Bluetooth mientras escanea, reapertura con el mismo periférico, fragmentación ≥ 20 B, cola de salida, `didDisconnect` → `connectionLost`, `lastDevice` al quedar notificando | PM-09, PM-11, PM-12 | `bleLineTransport.test.ts` (con mock del manejador BLE) + banco (SC-006) |
| `Link/PingerLink.swift` | `link/pingerLink.ts` | todo lo de FR-032: `minLiveInterval = 2000 ms`, `requestTimeout = 6 s`, `Waiter` de una sola resolución, `request` (lanza `requestInFlight` / `connectionLost`), `handle` (`cfg`, `warn` → `lastWarning` y `dutyWait`, `ping` → `last` + `history`), `!ERR` → `rejected`, `transportStateChanged`, `reconnect` (1→2→4) | = | `pingerLink.test.ts` con `SimulatedPinger` y temporizadores falsos (nuevo, de paridad) |
| `Link/SimulatedPinger.swift` | `link/simulatedPinger.ts` | FR-033; `simulateDisconnect()`; `SimInputs` | = | `simulatedPinger.test.ts` + SC-007 |
| `PingerPicker.swift` (`PingerScanner`) | `link/pingerScanner.ts` | `start` (reinicia, `timedOut` a los 10 s), `stop`, `devices`, `state` | = | unitario |
| `Session/SessionRecorder.swift` | `session/sessionRecorder.ts` | FR-040 | = | `sessionRecorder.test.ts` con `SimulatedPinger` y sensores falsos (nuevo, de paridad) |
| `Session/SessionStore.swift` | `session/sessionStore.ts` | FR-041; `save`, `load`, `sessions(forRepeater)`, `delete` | PM-14 | `sessionStore.test.ts` |

## 3. Interfaz (`src/ui/`, `src/screens/`)

| Origen Swift | Destino | Elementos (detalle en `ui-spec.md`) | Estado |
|---|---|---|---|
| `Theme.swift` | `ui/theme.ts` | `navy #011949`, `accent #2E8CFF`, `target #FF9E1A` + colores de sistema | = |
| `ContentView.swift` | `screens/MapScreen.tsx` | barra superior (navy, oscura, título "MeshAzimuth", botón de estilo de mapa, info, lista), mapa a pantalla completa (sin área segura inferior), botón de seguimiento, atribución OSM, panel inferior / cápsula, banners, hojas (editor, lista, acerca de), apuntamiento y guía a pantalla completa, `loc.start()` al aparecer | C-1, C-2, C-4 |
| `MapView.swift` | `screens/map/MapView.tsx` | FR-012, FR-013, FR-015; filtro de gestos (marcador, control, brújula y escala no disparan el alta) | C-3, PM-01, PM-02 |
| `TrackingButton.swift` | `screens/map/TrackingButton.tsx` | FR-014 | PM-03 |
| `PermissionBanner.swift` | `screens/PermissionBanner.tsx` | denegado o restringido → aviso + "Abrir Ajustes" (botón prominente pequeño) | PM-11 |
| `OnboardingView.swift` | `screens/OnboardingScreen.tsx` | 3 páginas (ícono 64 semibold target, título `.title.bold`, texto blanco 85 %, centrado, padding 32), paginador tipo iOS, botón prominente grande "Siguiente"/"Empezar", fondo navy, oscuro, no descartable | C-1 |
| `AboutView.swift` | `screens/AboutScreen.tsx` | secciones: cabecera (scope 44, nombre `.title2.bold`, subtítulo), Aplicación, Almacenamiento (+ pie), Depuración (+ pie), Desarrollador, Proyectos relacionados; "Listo"; guía a pantalla completa; diálogo de borrado | C-1 |
| `RepeaterViews.swift` (`RepeaterList`) | `screens/RepeaterListScreen.tsx` | filas (nombre `.headline`, detalle `.caption` tabular secundario, check target), detalle "306.7 km · az 62.8° ENE" (`%.1f km`/`%.0f m`, `az %.1f°`) o coordenadas `%.6f, %.6f`, búsqueda "Buscar repetidor", vista vacía, "Cerrar", "+", menú (Orden con selección, Importar JSON…, Exportar JSON), alerta "Importación" | PM-16 |
| `RepeaterViews.swift` (`RepeaterEditor`) | `screens/RepeaterEditorScreen.tsx` | secciones y pies exactos, validación del hash en rojo, parseo con `,`→`.`, `Guardar` deshabilitado según la regla, decide alta o edición contra el store, valores iniciales con `String(Double)` | FS-09, PM-17 |
| `AimView.swift` | `screens/AimScreen.tsx` | FR-028 | C-7 |
| `CompassView.swift` | `screens/aim/CompassView.tsx` (react-native-svg) | FR-027 | C-7 |
| `PingerSection.swift` | `screens/aim/PingerSection.tsx` | tarjeta de enlace, aviso de hash faltante, controles de medida solo con enlace operativo, botón con progreso "Midiendo d/t…", aviso de calibración, error en rojo, resumen de la lectura, botón "Sesión · N lecturas", propagación de `SimInputs`, reconfiguración del hash al cambiar | = |
| `LinkCard.swift` | `screens/aim/LinkCard.tsx` | FR-034; sparkline equivalente a Swift Charts `LineMark` con eje X oculto y eje Y por defecto, alto 56 | C-1 |
| `PingerPicker.swift` (vista) | `screens/PingerPickerScreen.tsx` | FR-034 | C-1 |
| `SessionView.swift` | `screens/SessionSheet.tsx`, `screens/SessionView.tsx` | FR-042 | FS-07 |
| `Assets.xcassets/AppIcon` | `android/app/src/main/res/mipmap-*` | ícono adaptativo a partir del PNG de 1024 | PM-15 |
| `Info.plist` / `project.yml` | `app.json`/`AndroidManifest.xml` | FR-050…FR-052 | PM-11, PM-15 |
| `PrivacyInfo.xcprivacy` | ficha "Seguridad de los datos" de Play (documento) | sin rastreo ni datos recogidos | = |

## 4. Tests

| Suite Swift | Casos | Destino | Regla |
|---|---|---|---|
| `GeoTests.swift` | 12 | `__tests__/core/geo.test.ts` | mismos nombres (`testX` → `test("x")`), datos y tolerancias (`accuracy` → `toBeCloseTo` con el delta absoluto equivalente, nunca con el número de dígitos de Jest) |
| `LineCodecTests.swift` | 16 | `__tests__/core/lineCodec.test.ts` | lee `../../MeshAzimuthTests/Fixtures/lines/*.txt`; mismas reglas de comentario (`#` solo, `# `, `#\t`) |
| `SessionCSVTests.swift` | 5 | `__tests__/core/sessionCsv.test.ts` | zona fija −05:00 |
| `SessionRulesTests.swift` | 13 | `__tests__/core/sessionRules.test.ts` | — |
| **Total** | **46** | | SC-001 |

## 5. Código sin uso en la referencia (verificado con grep @ 2eda6d9)

| Elemento | Uso en la app | Decisión |
|---|---|---|
| `LocationManager.updateOrientation` | ninguno (la app es solo vertical) | No se porta: no tiene efecto observable |
| `BLELineTransport.select(_:)` | ninguno | Se porta (API del transporte, sin efecto en la UI) |
| `SimulatedPinger.simulateDisconnect()` | ninguno en la app; útil en tests | Se porta, y lo usan los tests de reconexión de `pingerLink.test.ts` |
| `SessionStore.load`, `SessionStore.delete` | ninguno | Se portan (API del store, sin efecto en la UI) |
| `#Preview` de `CompassView` | herramienta de Xcode | Su equivalente es el estado `compass-preview` de la suite visual |
| `tools/sync_fixtures.sh` | herramienta del repo | Sin cambios: el port lee los fixtures del repo |
