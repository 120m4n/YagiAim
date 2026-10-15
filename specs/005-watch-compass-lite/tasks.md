---

description: "Task list for 005-watch-compass-lite"
---

# Tasks: Brújula lite en Apple Watch Series 3

**Input**: Design documents from `/specs/005-watch-compass-lite/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 `project.yml`: target `MeshAzimuthWatch` (watchOS, `deploymentTarget: "8.0"`, bundle `co.electrosoftware.meshazimuth.watchkitapp`, `WKCompanionAppBundleIdentifier`, `WKRunsIndependentlyOfCompanionApp: false`, nombre "MeshAzimuth"), incrustado en `MeshAzimuth`; carpeta `Shared/` en ambos targets. Verificar que `xcodegen generate` y la compilación funcionan con Xcode 26 y el destino watchOS 8 (R-7)
- [ ] T002 Mover `MeshAzimuth/Geo.swift` → `Shared/Geo.swift` sin cambios; `xcodebuild test` iOS sigue con 46/46 en verde
- [ ] T003 [P] Ícono del reloj desde `AppIcon.png` (tamaños de 38 y 42 mm)

## Phase 2: Foundational — compartido y tests (bloquea todo)

- [ ] T004 [P] `MeshAzimuthTests/WatchPayloadTests.swift`: los tests de contrato de `watch-message.md` §4 (deben fallar)
- [ ] T005 `Shared/WatchPayload.swift`: `WatchAimState`, `message()`, `decode`, `WatchEmitPolicy`, `WatchFreshness`, `WatchOrdering` hasta que T004 pase
- [ ] T006 Extraer `Needle`, `Triangle` y `BeamWedge` de `CompassView.swift` a `Shared/CompassShapes.swift` sin cambios de geometría; `CompassView` las usa (verificación visual: la captura 05_01 sin cambios)

**Checkpoint**: tests iOS en verde (46 existentes + los nuevos).

---

## Phase 3: User Story 1 — Ver cuánto girar (P1) 🎯 MVP

### iPhone

- [ ] T010 [US1] `MeshAzimuth/WatchBridge.swift`: activar `WCSession`; `publish` con `WatchEmitPolicy` (≤ 5/s + latido de 1 s); `updateApplicationContext` como mucho cada 1 s; responder a `snapshot`
- [ ] T011 [US1] `MeshAzimuthApp.swift`: crear `WatchBridge`, activarlo y añadirlo al entorno
- [ ] T012 [US1] `AimView.swift`: armar `WatchAimState` con los valores existentes (FR-002) y publicarlo en `onChange` de Δ, `aligned`, `tolerance`, precisión, aviso magnético y estado; `nil` en `onDisappear` y con `scenePhase != .active`. Sin cambios visibles

### Reloj

- [ ] T013 [P] [US1] `MeshAzimuthWatch/WatchModel.swift`: delegado de `WCSession`, `WatchOrdering`, `@Published state`
- [ ] T014 [P] [US1] `MeshAzimuthWatch/WatchHaptics.swift`: patrón D-4 con token de cancelación
- [ ] T015 [US1] `MeshAzimuthWatch/WatchCompassView.swift`: anillo, cuña, aguja Δ (camino corto, 0.15 s) y marca del boom con `CompassShapes`; colores de alineado; accesibilidad (FR-017)
- [ ] T016 [US1] `MeshAzimuthWatch/WatchContentView.swift`: nombre, brújula, instrucción y azimut (`watch-ui.md`); arranque de la háptica al pasar a `aligned` y parada al salir
- [ ] T017 [US1] Prueba con el Series 3: US1-AS1…AS4 y SC-002 (20 capturas simultáneas)

---

## Phase 4: User Story 2 — Estados y reconexión (P1)

- [ ] T020 [US2] `WatchModel`: datos viejos a los 3 s (`WatchFreshness`, temporizador solo en primer plano), `reachable`, `unsupportedVersion`
- [ ] T021 [US2] Activación (`scenePhase == .active`): leer `receivedApplicationContext` + `requestSnapshot()` (FR-014)
- [ ] T022 [US2] Pantallas `idle`, sin datos, sin conexión, `noLocation`, `noHeading`, versión y aviso magnético (`watch-ui.md`)
- [ ] T023 [US2] Pantalla de primera vez (FR-016)
- [ ] T024 [US2] Prueba con el Series 3: US2-AS1…AS6, SC-003 y SC-004

---

## Phase 5: User Story 3 — Distancia y precisión (P2)

- [ ] T030 [US3] Línea de distancia y precisión con los formatos de `AimInfo.distanceText` y `AimView.accuracyText`; color `target` si `!SessionRules.headingIsValid` (mover `headingIsValid` a `Shared/` solo si hace falta, sin cambiar la regla)

---

## Phase 6: Polish

- [ ] T040 SC-001: medir la latencia con vídeo a 60 fps de ambas pantallas → `specs/005-watch-compass-lite/bench-log.md`
- [ ] T041 SC-005: Instruments en el Series 3 (CPU, 2 min a 5 actualizaciones/s)
- [ ] T042 SC-006: tests iOS completos + banco del pinger (≈ 1.4 s por ping, sin cambio)
- [ ] T043 [P] README: sección "Apple Watch" (requisitos, instalación desde la app Watch, ajuste "Volver al reloj", limitaciones del Series 3)
- [ ] T044 [P] `PRIVACY.md`: el reloj solo recibe del iPhone el estado de apuntamiento; nada sale del par iPhone-reloj

## Dependencies & Execution Order

- T001 → T002 → T004/T005/T006 → US1 (iPhone T010–T012 y reloj T013–T016 en paralelo) → US2 → US3 → Polish.

## Trazabilidad FR → tareas

| FR | Tareas |
|---|---|
| FR-001…FR-007 | T010–T012, T042 |
| FR-010 | T001, T003 |
| FR-011, FR-015, FR-017 | T015, T016, T030 |
| FR-012 | T014, T016 |
| FR-013, FR-014, FR-016 | T020–T023 |
| FR-020, FR-021 | T002, T004–T006 |
