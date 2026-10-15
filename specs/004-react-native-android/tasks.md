---

description: "Task list for 004-react-native-android"
---

# Tasks: Port de MeshAzimuth a React Native (Android)

**Input**: Design documents from `/specs/004-react-native-android/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Obligatorios (Constitución V y VII). Cada tarea de implementación cita las filas de `parity-matrix.md` que cierra.

## Format: `[ID] [P?] [Story] Description`

## Phase 0: Decisiones (bloquean solo lo indicado)

- [ ] D001 Resolver C-1 (íconos) → bloquea T050
- [ ] D002 Resolver C-2 (fuente) → bloquea T051, T060
- [ ] D003 Resolver C-3 (mapa satélite y motor) → bloquea T070–T074
- [ ] D004 Resolver C-4 (vidrio/materiales) → bloquea T052
- [ ] D005 Resolver C-5 (precisión de la brújula) → bloquea T081
- [ ] D006 Resolver C-6 (calibración del sistema) → bloquea T081
- [ ] D007 Resolver C-7 (animación al cruzar el norte) → bloquea T085
- [ ] D008 Resolver C-8 (capturas de referencia) → bloquea T130–T133
- [ ] D009 Resolver C-9 (región) y C-10 (umbrales) → bloquean T013, T134
- [ ] D010 Resolver C-11 (SDK mínimo) → bloquea T001

---

## Phase 1: Setup

- [ ] T001 Crear `android-rn/` con Expo (prebuild, development build), TS estricto, Hermes, nueva arquitectura; `applicationId`, nombre, versión, solo vertical (FR-050)
- [ ] T002 [P] ESLint: prohibir `toFixed`/`toPrecision`/`Number()`/`parseFloat`/`parseInt` en `src/` (FS-01…FS-03) y la importación de `react-native` en `src/core/` (Constitución III)
- [ ] T003 [P] Jest con `moduleDirectories` que resuelva `../MeshAzimuthTests/Fixtures/lines` (FR-007)
- [ ] T004 [P] CI: `npm test`, `npm run lint`, `tsc --noEmit` y build `assembleRelease`
- [ ] T005 [P] Verificar que Hermes trae `Intl.Segmenter`, `Intl.Collator` y `TextDecoder` (R-1). Si falta alguno, documentarlo y añadir polyfill

---

## Phase 2: Foundational — dorados y utilidades de semántica (bloquea todo)

- [ ] T010 [P] `tools/goldens/main.swift` (R-13): casos de FS-01…FS-12, `Geo` y `AimInfo` en puntos de muestra, `SessionRules` con las muestras de los tests, CSV de la sesión de ejemplo, JSON de repetidores y de sesión, `SplitMix64(seed: 1)` (1000 `next()`, 100 `uniform()`, 100 `gaussian()`), `ByteCountFormatter`, `Date.formatted` en las regiones de C-9
- [ ] T011 Ejecutar los dorados en macOS contra `2eda6d9` y commitear `__tests__/goldens/swift-goldens.json`
- [ ] T012 [P] Tests de `core/formatC.ts` contra los dorados (FS-01)
- [ ] T013 [P] Tests de `core/swiftParse.ts` (`parseSwiftDouble`, `parseSwiftInt`), `core/swiftDescribe.ts` (FS-09), `core/round.ts` (FS-04), `core/split.ts` (FS-05), `core/swiftDate.ts` (FS-07), `core/dateStyle.ts` (FS-07, C-9), `core/byteCount.ts` (FS-10), `core/textMatch.ts` (FS-11), `core/uuid.ts` (FS-12), `core/swiftJson.ts` (SF-03, SF-04)
- [ ] T014 Implementar los módulos de T012–T013 hasta que pasen

**Checkpoint**: las utilidades de semántica pasan el 100 % de los dorados.

---

## Phase 3: User Story 1 — Núcleo (P1) 🎯 MVP

### Tests portados (primero, deben fallar)

- [ ] T020 [P] [US1] `__tests__/core/geo.test.ts`: los 12 casos de `GeoTests.swift`
- [ ] T021 [P] [US1] `__tests__/core/lineCodec.test.ts`: los 16 casos de `LineCodecTests.swift`, leyendo los fixtures del repo con el mismo cargador (comentarios `#`, `# `, `#\t`; error si falta la expectativa)
- [ ] T022 [P] [US1] `__tests__/core/sessionRules.test.ts`: los 13 casos de `SessionRulesTests.swift`
- [ ] T023 [P] [US1] `__tests__/core/sessionCsv.test.ts`: los 5 casos de `SessionCSVTests.swift`, incluido su parser de CSV del test
- [ ] T024 [P] [US1] Tests de paridad nuevos: `aimInfo`, `repeater` (`normalizedHashPrefix`, `merge`), `splitmix64` y `yagiGain` contra los dorados

### Implementación

- [ ] T025 [P] [US1] `core/geo.ts` (parity §1 `Geo.swift`)
- [ ] T026 [P] [US1] `core/lineCodec.ts` + `core/lineAssembler.ts`
- [ ] T027 [P] [US1] `core/sessionModels.ts` (`SessionRules`)
- [ ] T028 [P] [US1] `core/sessionCsv.ts`
- [ ] T029 [P] [US1] `core/aimInfo.ts`, `core/repeater.ts`, `core/splitmix64.ts`, `core/yagiGain.ts`
- [ ] T030 [US1] CSV idéntico byte a byte al dorado de iOS (SC-003)

**Checkpoint**: SC-001, SC-002 y SC-003 (CSV) en verde.

---

## Phase 4: Plataforma base (bloquea US2–US5)

- [ ] T040 [P] `platform/kv.ts` sobre MMKV con las 11 claves, tipos y valores por defecto de SF-01, con test de reinicio
- [ ] T041 [P] `platform/files.ts` (escritura atómica, `filesDir`, `cacheDir`), `platform/share.ts` (`FileProvider`, MIME), `platform/documentPicker.ts` (SAF JSON)
- [ ] T042 [P] `platform/settings.ts` (PM-11: ajustes de la app / de Bluetooth), `platform/permissions.ts` (ubicación y BLE según la API)
- [ ] T043 [P] `platform/keepAwake.ts`, `platform/haptics.ts` (PM-10, con tests del token y de la reentrada)
- [ ] T044 [P] `state/networkStore.ts` (PM-13)
- [ ] T045 `state/providers.tsx`: instancias únicas y factoría de transporte (simulado o BLE según `pinger.simulated` al conectar) (`MeshAzimuthApp.swift`)

## Phase 5: Sistema de diseño iOS (bloquea las pantallas)

- [ ] T050 [US6] Íconos: los 33 de `inventory/symbols.tsv` según D001, con hoja de contacto comparada con los glifos de las capturas
- [ ] T051 [US6] `ui/typography.ts`: estilos de `ui-spec.md` §1.1 con la fuente de D002 y cifras tabulares
- [ ] T052 [US6] `ui/ios/Material.tsx` (D004) y `GlassCapsule.tsx`
- [ ] T053 [P] [US6] `ui/colors.ts`: tokens de §1.2, oscuro medido y claro tras D008
- [ ] T054 [US6] Componentes de `ui-spec.md` §2, cada uno con una página de catálogo en el build `visualTest`: NavBar, Sheet (con gestos y animaciones de R-6), FullScreen, GroupedList/Row/Section con pie, Switch, Slider, ProminentButton, BorderedButton, botón destructivo, ConfirmationDialog, Alert, Menu (+ Picker con check), SwipeRow (con deslizamiento completo), SearchBar, ContentUnavailable, ActivityIndicator, PageControl, Label, NumericText
- [ ] T055 [US6] Botón Atrás según la tabla de PM-18 en Sheet, FullScreen, diálogos y la guía

---

## Phase 6: User Story 2 — Mapa y repetidores (P1)

- [ ] T060 [US2] Calibración tipográfica: ajustar el tracking con las capturas 02 y 09 hasta cumplir VA-6 (a) en las zonas de texto
- [ ] T061 [P] [US2] `state/repeaterStore.ts` + tests (FR-010, SF-01, SF-03)
- [ ] T062 [P] [US2] Importar y exportar JSON con dorado byte a byte y prueba cruzada iOS ↔ Android (FR-011, SC-003)
- [ ] T070 [US2] `screens/map/MapView.tsx`: motor de D003, OSM con caché de PM-01, satélite de PM-02, marcadores y línea (FR-013), filtro de gestos, toque simple
- [ ] T071 [US2] `screens/map/TrackingButton.tsx` (FR-014, PM-03)
- [ ] T072 [US2] Persistencia de la región (`map.camera`) y arranque siguiendo al usuario o no (FR-015)
- [ ] T073 [US2] `screens/MapScreen.tsx`: barra, panel, cápsula, atribución, banners, presentación de hojas y pantallas completas (FR-016)
- [ ] T074 [US2] Caché de mapas en *Acerca de*: tamaño (FS-10) y borrado (PM-01)
- [ ] T075 [P] [US2] `screens/PermissionBanner.tsx`, `screens/OnboardingScreen.tsx`, `screens/AboutScreen.tsx`
- [ ] T076 [US2] `screens/RepeaterListScreen.tsx` (búsqueda FS-11, orden, menú, deslizamientos, vista vacía, alerta de importación, reescritura del export en cada cambio)
- [ ] T077 [US2] `screens/RepeaterEditorScreen.tsx` (FS-02, FS-09, PM-17; regla de "Guardar"; alta o edición contra el store)

---

## Phase 7: User Story 3 — Apuntamiento (P1)

- [ ] T080 [US3] Módulo Kotlin `modules/altitude` (PM-08) + `native/altitude.ts`
- [ ] T081 [US3] Módulo Kotlin `modules/heading`: rumbo magnético y verdadero (`GeomagneticField`), precisión (D005), filtro de 0.5°, tasa de R-3, eje de R-4, pitch con signo (PM-07); expone eventos a JS
- [ ] T082 [US3] `state/locationStore.ts`: proveedor fusionado (PM-04), `location.last` cada 5 s, `isCachedLocation`, EMA de 0.25, `headingOffset`/`calibrate`, `usingMagneticFallback` según PM-05 (1), con tests del suavizado y de la persistencia
- [ ] T083 [US3] `state/motionStore.ts` (EMA 0.3, 10 Hz, `start` sin reentrada, `stop` → undefined)
- [ ] T084 [US3] R-3 y R-4: mediciones en iOS y Android → `bench-log.md`; ajustar T081
- [ ] T085 [US3] `screens/aim/CompassView.tsx` con Skia (FR-027; animación según D007; histéresis; hápticos; accesibilidad)
- [ ] T086 [US3] `screens/AimScreen.tsx` (FR-028; tabla y formatos; tolerancia; diálogo de calibración; norte magnético; pantalla encendida; desconexión al salir; `stopLive` en segundo plano)
- [ ] T087 [US3] Campo: SC-004 con iPhone y Android lado a lado → `bench-log.md`

---

## Phase 8: User Story 4 — Pinger BLE (P1)

### Tests de paridad (primero)

- [ ] T090 [P] [US4] `__tests__/link/simulatedPinger.test.ts`: respuestas a cada comando, `busy`/`nohash`, duty cycle con `#WARN duty_wait`, tiempos (temporizadores falsos), secuencia de la semilla 1 igual al dorado (SC-007)
- [ ] T091 [P] [US4] `__tests__/link/pingerLink.test.ts` con el simulador: orden del handshake; `proto≠1` → `incompatibleFirmware`; `requestInFlight`; timeout de 6 s; `!ERR` → `rejected`; `dutyWait`; "En vivo" con un intervalo de `max(2000, rate)` y comportamiento ante errores; reconexión 1→2→4 que retoma "En vivo"; `disconnect()` limpia todo (`PingerLink.swift` L76–289)
- [ ] T092 [P] [US4] `__tests__/link/bleLineTransport.test.ts` con un mock de `BleManager`: fragmentación por MTU (≥ 20), orden de escritura, notificaciones fragmentadas, `lastDevice` al quedar notificando, timeout de apertura de 10 s (`deviceNotFound`/`timeout`), desconexión → `connectionLost`, estados de Bluetooth
- [ ] T093 [P] [US4] `__tests__/link/pingerScanner.test.ts`: `timedOut` a los 10 s, reinicio

### Implementación

- [ ] T094 [P] [US4] `link/lineTransport.ts` (tipos, mensajes exactos, `opensSettings`)
- [ ] T095 [US4] `link/simulatedPinger.ts` (FR-033) con cola serializada equivalente al actor `Engine`
- [ ] T096 [US4] `link/pingerLink.ts` (FR-032)
- [ ] T097 [US4] `link/bleLineTransport.ts` (FR-031, PM-09, PM-12) y `link/pingerScanner.ts`
- [ ] T098 [US4] R-5 en 2 teléfonos → decide el filtro de escaneo (PM-09)
- [ ] T099 [US4] `screens/PingerPickerScreen.tsx` y `screens/aim/LinkCard.tsx` + `Sparkline.tsx` (FR-034, R-12)
- [ ] T100 [US4] Banco SC-006 con el pinger real → `bench-log.md`

---

## Phase 9: User Story 5 — Medición y sesiones (P2)

- [ ] T110 [P] [US5] `__tests__/session/sessionRecorder.test.ts` con el simulador y sensores falsos: precondiciones y errores en orden; pausa y reanudación de "En vivo"; `configure` si cambió el hash; `headingTx` en `onSent` y `headingRx` al recibir; omisión ante `rejected`/`timeout`; intervalo; guardado
- [ ] T111 [P] [US5] `__tests__/session/sessionStore.test.ts`: escritura atómica, orden, filtro, corruptos omitidos, JSON igual al dorado (SF-04)
- [ ] T112 [US5] `session/sessionRecorder.ts`, `session/sessionStore.ts`
- [ ] T113 [US5] `screens/aim/PingerSection.tsx` (botón con progreso, avisos, resumen, botón de sesión, `SimInputs`, reconfiguración del hash, hápticos de FR-043)
- [ ] T114 [US5] `screens/SessionSheet.tsx`, `screens/SessionView.tsx` (fechas FS-07, CSV y compartir)

---

## Phase 10: User Story 6 — Suite visual (P2, transversal)

- [ ] T130 [US6] Según D008: (a) arnés DEBUG en iOS con argumentos de lanzamiento para los proveedores de VA-7 y una prueba XCUITest que captura los 61 estados con sus marcos (VA-6 c); o (b) guion de captura manual
- [ ] T131 [US6] Variante `visualTest` en Android con los proveedores falsos de VA-7 y flujos Maestro para los 61 estados
- [ ] T132 [US6] AVD de referencia (VA-2) y script de preparación (modo demo, modo oscuro, escala, región)
- [ ] T133 [US6] Comparador: recorte por áreas seguras (VA-3), máscaras (VA-4), P3 → sRGB (VA-5), métricas (a)–(d) (VA-6), `zones.json`, informe HTML
- [ ] T134 [US6] `npm run visual` en CI con un emulador; umbrales de D009

---

## Phase 11: Polish y cierre

- [ ] T140 [P] Ícono adaptativo, ícono heredado y arranque (PM-15)
- [ ] T141 [P] Ficha de seguridad de datos de Play y `PRIVACY.md` (sección Android, mismo contenido; FR-053)
- [ ] T142 [P] `android-rn/README.md`: compilar, probar, regenerar los dorados y los inventarios
- [ ] T143 Revisión de la matriz de paridad: cada fila con estado y prueba (SC-008)
- [ ] T144 Pase final de VA en los 61 estados y firma del dueño del producto

## Dependencies & Execution Order

- D010 → T001. Phase 2 → US1. Phase 4 → US2–US5. Phase 5 (con D001, D002 y D004) → pantallas.
- US1 empieza sin ninguna decisión. US4 (lógica) puede ir en paralelo con US2/US3 gracias al simulador.
- US6: T131–T133 avanzan en paralelo con las pantallas; T134 cierra cada historia de UI.

### Parallel Example

```bash
# Día 1, sin decisiones:
T010 dorados  |  T020–T024 tests portados  |  T040–T044 plataforma
# Con C-3 resuelto:
T070–T074 mapa  ||  T090–T097 enlace (simulador)  ||  T080–T083 sensores
```

## Trazabilidad FR → tareas

| FR | Tareas |
|---|---|
| FR-001…FR-007 | T010–T014, T020–T030 |
| FR-010, FR-011 | T061, T062 |
| FR-012…FR-015 | T070–T072 |
| FR-016…FR-018 | T073–T077, T044 |
| FR-020…FR-025 | T080–T084, T087 |
| FR-026…FR-028 | T043, T085, T086 |
| FR-030…FR-035 | T042, T090–T100 |
| FR-040…FR-043 | T110–T114 |
| FR-050…FR-053 | T001, T140, T141 |
| FR-060…FR-065 | T050–T055, T060, T130–T134 |

## Implementation Strategy

MVP = US1, verificable sin hardware y sin decisiones pendientes. Después, US4 con el simulador (la lógica más delicada), y luego las pantallas en el orden en que se resuelvan C-1…C-4. La suite visual se monta temprano: es la que dice si "pixel perfect" se cumple.
