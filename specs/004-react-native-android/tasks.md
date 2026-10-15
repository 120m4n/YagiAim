---

description: "Task list for 004-react-native-android"
---

# Tasks: Port de MeshAzimuth a React Native (Android)

**Input**: Design documents from `/specs/004-react-native-android/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Obligatorios (Constitución V y VII). Cada tarea de implementación cita las filas de `parity-matrix.md` que cierra.

## Format: `[ID] [P?] [Story] Description`

## Phase 0: Decisiones — cerradas (sesión del 2026-10-14)

- [x] D001 C-1 íconos → propios sobre Lucide/Phosphor (PM-25)
- [x] D002 C-2 fuente → Inter + N/E/S/O como trazos propios + JetBrains Mono (PM-26)
- [x] D003 C-3 mapa → MapLibre RN; OSM; satélite EOX Sentinel-2 cloudless 2016 + OpenFreeMap (PM-02)
- [x] D004 C-4 materiales → colores sólidos medidos; desenfoque solo sobre el mapa (PM-27)
- [x] D005 C-5 precisión de la brújula → FOP → `values[4]` → `-1` (PM-05)
- [x] D006 C-6 calibración del sistema → nada (PM-24)
- [x] D007 C-7 cruce del norte → se replica la vuelta larga
- [x] D008 C-8 referencias → sin cambios en iOS; capturas existentes + línea base Android aprobada (VA-9)
- [x] D009 C-9 `es_CO`; C-10 criterio "geometría y color estrictos, glifos flexibles" (VA-6)
- [x] D010 C-11 `minSdk 26`, `targetSdk 35`

---

## Phase 1: Setup

- [x] T001 Crear `android-rn/` con Expo (prebuild, development build), TS estricto, Hermes, nueva arquitectura; `applicationId`, nombre, versión, solo vertical (FR-050) — _`expo prebuild` valida manifiesto, plugins y autoenlace de los 3 módulos; falta compilar con el SDK de Android_
- [x] T002 [P] ESLint: prohibir `toFixed`/`toPrecision`/`Number()`/`parseFloat`/`parseInt` en `src/` (FS-01…FS-03) y la importación de `react-native` en `src/core/` (Constitución III)
- [x] T003 [P] Jest con `moduleDirectories` que resuelva `../MeshAzimuthTests/Fixtures/lines` (FR-007)
- [x] T004 [P] CI: `npm test`, `npm run lint`, `tsc --noEmit` y build `assembleRelease` — _workflow en `.github/workflows/android-rn.yml`; el job de build no se ha ejecutado_
- [ ] T005 [P] Verificar que Hermes trae `Intl.Segmenter`, `Intl.Collator` y `TextDecoder` (R-1). Si falta alguno, documentarlo y añadir polyfill

---

## Phase 2: Foundational — dorados y utilidades de semántica (bloquea todo)

- [x] T010 [P] `tools/goldens/main.swift` (R-13): casos de FS-01…FS-12, `Geo` y `AimInfo` en puntos de muestra, `SessionRules` con las muestras de los tests, CSV de la sesión de ejemplo, JSON de repetidores y de sesión, `SplitMix64(seed: 1)` (1000 `next()`, 100 `uniform()`, 100 `gaussian()`), `ByteCountFormatter` y `Date.formatted` en `es_CO` y `en_US`, y las 4 sparklines de R-12 renderizadas con `ImageRenderer` (sin tocar la app iOS) — _sin modificar la app iOS; excluye `SessionRecorder.swift` (depende de UIKit)_
- [x] T011 Ejecutar los dorados en macOS contra `2eda6d9` y commitear `__tests__/goldens/swift-goldens.json`
- [x] T012 [P] Tests de `core/formatC.ts` contra los dorados (FS-01)
- [x] T013 [P] Tests de `core/swiftParse.ts` (`parseSwiftDouble`, `parseSwiftInt`), `core/swiftDescribe.ts` (FS-09), `core/round.ts` (FS-04), `core/split.ts` (FS-05), `core/swiftDate.ts` (FS-07), `core/dateStyle.ts` (FS-07, C-9), `core/byteCount.ts` (FS-10), `core/textMatch.ts` (FS-11), `core/uuid.ts` (FS-12), `core/swiftJson.ts` (SF-03, SF-04)
- [x] T014 Implementar los módulos de T012–T013 hasta que pasen

**Checkpoint**: las utilidades de semántica pasan el 100 % de los dorados.

---

## Phase 3: User Story 1 — Núcleo (P1) 🎯 MVP

### Tests portados (primero, deben fallar)

- [x] T020 [P] [US1] `__tests__/core/geo.test.ts`: los 12 casos de `GeoTests.swift`
- [x] T021 [P] [US1] `__tests__/core/lineCodec.test.ts`: los 16 casos de `LineCodecTests.swift`, leyendo los fixtures del repo con el mismo cargador (comentarios `#`, `# `, `#\t`; error si falta la expectativa)
- [x] T022 [P] [US1] `__tests__/core/sessionRules.test.ts`: los 13 casos de `SessionRulesTests.swift`
- [x] T023 [P] [US1] `__tests__/core/sessionCsv.test.ts`: los 5 casos de `SessionCSVTests.swift`, incluido su parser de CSV del test
- [x] T024 [P] [US1] Tests de paridad nuevos: `aimInfo`, `repeater` (`normalizedHashPrefix`, `merge`), `splitmix64` y `yagiGain` contra los dorados — _aimInfo, repeater, splitmix64 y yagiGain contra los dorados (`goldens.test.ts`)_

### Implementación

- [x] T025 [P] [US1] `core/geo.ts` (parity §1 `Geo.swift`)
- [x] T026 [P] [US1] `core/lineCodec.ts` + `core/lineAssembler.ts`
- [x] T027 [P] [US1] `core/sessionModels.ts` (`SessionRules`)
- [x] T028 [P] [US1] `core/sessionCsv.ts`
- [x] T029 [P] [US1] `core/aimInfo.ts`, `core/repeater.ts`, `core/splitmix64.ts`, `core/yagiGain.ts`
- [x] T030 [US1] CSV idéntico byte a byte al dorado de iOS (SC-003)

**Checkpoint**: SC-001, SC-002 y SC-003 (CSV) en verde.

---

## Phase 4: Plataforma base (bloquea US2–US5)

- [x] T040 [P] `platform/kv.ts` sobre MMKV con las 11 claves, tipos y valores por defecto de SF-01, con test de reinicio
- [x] T041 [P] `platform/files.ts` (escritura atómica, `filesDir`, `cacheDir`), `platform/share.ts` (`FileProvider`, MIME), `platform/documentPicker.ts` (SAF JSON)
- [x] T042 [P] `platform/settings.ts` (PM-11: ajustes de la app / de Bluetooth), `platform/permissions.ts` (ubicación y BLE según la API)
- [x] T043 [P] `platform/keepAwake.ts`, `platform/haptics.ts` (PM-10, con tests del token y de la reentrada)
- [x] T044 [P] `state/networkStore.ts` (PM-13)
- [x] T045 `state/providers.tsx`: instancias únicas y factoría de transporte (simulado o BLE según `pinger.simulated` al conectar) (`MeshAzimuthApp.swift`)

## Phase 5: Sistema de diseño iOS (bloquea las pantallas)

- [x] T050 [US6] Íconos propios (PM-25): los 33 de `inventory/symbols.tsv` sobre Lucide/Phosphor, con tamaño de caja y centro ajustados a las capturas (VA-6 d) y hoja de contacto; registrar la licencia base en `android-rn/NOTICE` — _33 glifos de Lucide + 3 de controles del sistema; falta ajustar caja/centro contra las capturas (VA-6 d)_
- [x] T051 [US6] `ui/typography.ts`: estilos de `ui-spec.md` §1.1 con Inter (cifras tabulares) y JetBrains Mono; trazos propios N/E/S/O para la brújula; fuentes en `assets/fonts` con su licencia OFL — _tipografía y trazos N/E/S/O hechos; tracking de la tabla de Apple, a calibrar en T060_
- [x] T052 [US6] `ui/ios/Material.tsx` y `GlassCapsule.tsx` (PM-27): colores sólidos medidos + borde de brillo; variante con desenfoque solo para los elementos sobre el mapa
- [x] T053 [P] [US6] `ui/colors.ts`: tokens de §1.2; oscuro medido en las capturas (y verificados `label`, `secondaryLabel`, verde y rojo); claro con la paleta de sistema publicada por Apple — _oscuro con los valores medidos del spec; verificación contra capturas pendiente_
- [x] T054 [US6] Componentes de `ui-spec.md` §2, cada uno con una página de catálogo en el build `visualTest`: NavBar, Sheet (con gestos y animaciones de R-6), FullScreen, GroupedList/Row/Section con pie, Switch, Slider, ProminentButton, BorderedButton, botón destructivo, ConfirmationDialog, Alert, Menu (+ Picker con check), SwipeRow (con deslizamiento completo), SearchBar, ContentUnavailable, ActivityIndicator, PageControl, Label, NumericText — _componentes escritos; falta la página de catálogo `visualTest`_
- [x] T055 [US6] Botón Atrás según la tabla de PM-18 en Sheet, FullScreen, diálogos y la guía

---

## Phase 6: User Story 2 — Mapa y repetidores (P1)

- [ ] T060 [US2] Calibración tipográfica: ajustar el tracking con las capturas 02 y 09 hasta cumplir VA-6 (a) en las zonas de texto
- [x] T061 [P] [US2] `state/repeaterStore.ts` + tests (FR-010, SF-01, SF-03)
- [x] T062 [P] [US2] Importar y exportar JSON con dorado byte a byte y prueba cruzada iOS ↔ Android (FR-011, SC-003) — _JSON byte a byte contra el dorado; falta la prueba cruzada con un iPhone_
- [x] T070 [US2] `screens/map/MapView.tsx`: MapLibre RN, OSM con caché de PM-01, satélite EOX (capa y URL desde `GetCapabilities`) + estilo de vías y rótulos de OpenFreeMap y atribuciones de PM-02, marcadores y línea (FR-013), filtro de gestos, toque simple — _MapLibre con OSM, satélite EOX + OpenFreeMap y línea; sin verificar en dispositivo (doble toque, servir teselas vencidas sin red)_
- [x] T071 [US2] `screens/map/TrackingButton.tsx` (FR-014, PM-03)
- [x] T072 [US2] Persistencia de la región (`map.camera`) y arranque siguiendo al usuario o no (FR-015)
- [x] T073 [US2] `screens/MapScreen.tsx`: barra, panel, cápsula, atribución, banners, presentación de hojas y pantallas completas (FR-016)
- [x] T074 [US2] Caché de mapas en *Acerca de*: tamaño (FS-10) y borrado (PM-01) — _borrado vía `OfflineManager`; el tamaño busca `mbgl-offline.db*` y está sin verificar_
- [x] T075 [P] [US2] `screens/PermissionBanner.tsx`, `screens/OnboardingScreen.tsx`, `screens/AboutScreen.tsx`
- [x] T076 [US2] `screens/RepeaterListScreen.tsx` (búsqueda FS-11, orden, menú, deslizamientos, vista vacía, alerta de importación, reescritura del export en cada cambio)
- [x] T077 [US2] `screens/RepeaterEditorScreen.tsx` (FS-02, FS-09, PM-17; regla de "Guardar"; alta o edición contra el store)

---

## Phase 7: User Story 3 — Apuntamiento (P1)

- [x] T080 [US3] Módulo Kotlin `modules/altitude` (PM-08) + `native/altitude.ts` — _escrito, sin compilar_
- [x] T081 [US3] Módulo Kotlin `modules/heading`: Fused Orientation Provider (rumbo verdadero o magnético, `headingErrorDegrees`); respaldo con vector de rotación + `GeomagneticField` + `values[4]`/`-1`; filtro de 0.5°, tasa de R-3, eje de R-4, pitch con signo (PM-05, PM-07). Verificar en dispositivo las unidades del error y cómo indica FOP el norte magnético → `bench-log.md` — _escrito, sin compilar; unidades de `headingErrorDegrees` y norte magnético pendientes de dispositivo_
- [x] T082 [US3] `state/locationStore.ts`: proveedor fusionado (PM-04), `location.last` cada 5 s, `isCachedLocation`, EMA de 0.25, `headingOffset`/`calibrate`, `usingMagneticFallback` según PM-05 (1), con tests del suavizado y de la persistencia
- [x] T083 [US3] `state/motionStore.ts` (EMA 0.3, 10 Hz, `start` sin reentrada, `stop` → undefined)
- [ ] T084 [US3] R-3 y R-4: mediciones en iOS y Android → `bench-log.md`; ajustar T081
- [x] T085 [US3] `screens/aim/CompassView.tsx` con Skia (FR-027; animación numérica con la vuelta larga al cruzar el norte, C-7; histéresis; hápticos; accesibilidad)
- [x] T086 [US3] `screens/AimScreen.tsx` (FR-028; tabla y formatos; tolerancia; diálogo de calibración; norte magnético; pantalla encendida; desconexión al salir; `stopLive` en segundo plano)
- [ ] T087 [US3] Campo: SC-004 con iPhone y Android lado a lado → `bench-log.md`

---

## Phase 8: User Story 4 — Pinger BLE (P1)

### Tests de paridad (primero)

- [x] T090 [P] [US4] `__tests__/link/simulatedPinger.test.ts`: respuestas a cada comando, `busy`/`nohash`, duty cycle con `#WARN duty_wait`, tiempos (temporizadores falsos), secuencia de la semilla 1 igual al dorado (SC-007)
- [x] T091 [P] [US4] `__tests__/link/pingerLink.test.ts` con el simulador: orden del handshake; `proto≠1` → `incompatibleFirmware`; `requestInFlight`; timeout de 6 s; `!ERR` → `rejected`; `dutyWait`; "En vivo" con un intervalo de `max(2000, rate)` y comportamiento ante errores; reconexión 1→2→4 que retoma "En vivo"; `disconnect()` limpia todo (`PingerLink.swift` L76–289)
- [x] T092 [P] [US4] `__tests__/link/bleLineTransport.test.ts` con un mock de `BleManager`: fragmentación por MTU (≥ 20), orden de escritura, notificaciones fragmentadas, `lastDevice` al quedar notificando, timeout de apertura de 10 s (`deviceNotFound`/`timeout`), desconexión → `connectionLost`, estados de Bluetooth
- [ ] T093 [P] [US4] `__tests__/link/pingerScanner.test.ts`: `timedOut` a los 10 s, reinicio

### Implementación

- [x] T094 [P] [US4] `link/lineTransport.ts` (tipos, mensajes exactos, `opensSettings`)
- [x] T095 [US4] `link/simulatedPinger.ts` (FR-033) con cola serializada equivalente al actor `Engine`
- [x] T096 [US4] `link/pingerLink.ts` (FR-032)
- [x] T097 [US4] `link/bleLineTransport.ts` (FR-031, PM-09, PM-12) y `link/pingerScanner.ts`
- [ ] T098 [US4] R-5 en 2 teléfonos → decide el filtro de escaneo (PM-09)
- [x] T099 [US4] `screens/PingerPickerScreen.tsx` y `screens/aim/LinkCard.tsx` + `Sparkline.tsx` (FR-034, R-12) — _sparkline con escala aproximada (R-12 pendiente)_
- [ ] T100 [US4] Banco SC-006 con el pinger real → `bench-log.md`

---

## Phase 9: User Story 5 — Medición y sesiones (P2)

- [x] T110 [P] [US5] `__tests__/session/sessionRecorder.test.ts` con el simulador y sensores falsos: precondiciones y errores en orden; pausa y reanudación de "En vivo"; `configure` si cambió el hash; `headingTx` en `onSent` y `headingRx` al recibir; omisión ante `rejected`/`timeout`; intervalo; guardado
- [x] T111 [P] [US5] `__tests__/session/sessionStore.test.ts`: escritura atómica, orden, filtro, corruptos omitidos, JSON igual al dorado (SF-04) — _escritura atómica y orden; corruptos omitidos_
- [x] T112 [US5] `session/sessionRecorder.ts`, `session/sessionStore.ts`
- [x] T113 [US5] `screens/aim/PingerSection.tsx` (botón con progreso, avisos, resumen, botón de sesión, `SimInputs`, reconfiguración del hash, hápticos de FR-043)
- [x] T114 [US5] `screens/SessionSheet.tsx`, `screens/SessionView.tsx` (fechas FS-07, CSV y compartir)

---

## Phase 10: User Story 6 — Suite visual (P2, transversal)

- [ ] T130 [US6] Anotar las 12 capturas iOS existentes (VA-1): cajas de los elementos con `testID` (segmentación + revisión manual) y valores visibles → `visual/states/<estado>.json`. Sin cambios en la app iOS
- [ ] T131 [US6] Variante `visualTest` en Android con los proveedores falsos de VA-7 y flujos Maestro para los 61 estados, alimentados por `visual/states/*.json`
- [ ] T132 [US6] AVD de referencia (VA-2) y script de preparación (modo demo, modo oscuro, escala, región)
- [ ] T133 [US6] Comparador: recorte por áreas seguras (VA-3), máscaras (VA-4), P3 → sRGB (VA-5), métricas (a)–(f) con exclusión de glifos (VA-6), informe HTML
- [ ] T134 [US6] `npm run visual` en CI con un emulador: 11 estados contra iOS (12 capturas) + 50 contra la línea base
- [ ] T135 [US6] Generar la línea base de los 50 estados sin referencia iOS y hacer la revisión de aprobación con el dueño, lado a lado con la app iOS en un iPhone → `visual/approvals.md` (VA-9)

---

## Phase 11: Polish y cierre

- [x] T140 [P] Ícono adaptativo, ícono heredado y arranque (PM-15) — _ícono y adaptativo con el PNG de iOS; falta revisión visual del lanzador_
- [x] T141 [P] Ficha de seguridad de datos de Play y `PRIVACY.md` (sección Android, mismo contenido; FR-053)
- [x] T142 [P] `android-rn/README.md`: compilar, probar, regenerar los dorados y los inventarios
- [ ] T143 Revisión de la matriz de paridad: cada fila con estado y prueba (SC-008)
- [ ] T144 Pase final de VA en los 61 estados (11 contra iOS + 50 contra la línea base aprobada) y firma del dueño del producto

## Dependencies & Execution Order

- Phase 2 → US1. Phase 4 → US2–US5. Phase 5 → pantallas. (Phase 0 cerrada: no hay bloqueos de decisión.)
- US1 empieza sin ninguna decisión. US4 (lógica) puede ir en paralelo con US2/US3 gracias al simulador.
- US6: T131–T133 avanzan en paralelo con las pantallas; T134 cierra cada historia de UI.

### Parallel Example

```bash
# Día 1, sin decisiones:
T010 dorados  |  T020–T024 tests portados  |  T040–T044 plataforma
# En paralelo:
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

MVP = US1, verificable sin hardware. Después, US4 con el simulador (la lógica más delicada), luego US2/US3 sobre el sistema de diseño de la Phase 5, y US5. La suite visual se monta temprano: es la que dice si "pixel perfect" se cumple.
