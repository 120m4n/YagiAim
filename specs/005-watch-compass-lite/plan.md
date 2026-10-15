# Implementation Plan: Brújula lite en Apple Watch Series 3

**Branch**: `005-watch-compass-lite` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-watch-compass-lite/spec.md`

## Summary

App de watchOS 8 (Series 3) que muestra en la muñeca la brújula de apuntamiento del iPhone: aguja respecto al boom, "Gira N°"/"Alineado", azimut, distancia y precisión, con háptica al alinear. El iPhone es el único sensor y la única fuente de verdad: el reloj no calcula ni decide nada. Se comunican por WatchConnectivity con un protocolo pequeño y versionado. En la app iOS el cambio se limita a un puente y a publicar el estado que `AimView` ya tiene.

## Technical Context

**Language/Version**: Swift 5.9. iOS 17+ (sin cambios) y watchOS 8.0+.

**Primary Dependencies**: WatchConnectivity, SwiftUI y WatchKit (`WKInterfaceDevice` para la háptica). Ninguna de terceros.

**Storage**: `UserDefaults` del reloj (`watch.intro.done`).

**Testing**: XCTest en el target iOS para `Shared/` (carga útil, emisión, orden, antigüedad); pruebas manuales con el Series 3 para latencia, háptica y rendimiento.

**Target Platform**: iPhone (iOS 17+) + Apple Watch Series 3 (watchOS 8.8.1). Compilado con Xcode 26.x (destino watchOS 8).

**Project Type**: app móvil + app del reloj incluida.

**Performance Goals**: latencia ≤ 500 ms p95; ≤ 5 actualizaciones/s; CPU del reloj < 30 %.

**Constraints**: APIs de watchOS 8 (sin Observation, Charts, `sensoryFeedback`); sin cambios de comportamiento en iOS; sin sesiones extendidas.

**Scale/Scope**: unos 6 archivos nuevos en el reloj, 3 compartidos y 1 puente en iOS, más un cambio pequeño en `AimView`/`CompassView`/`MeshAzimuthApp`.

## Constitution Check

| Principio | Cumple | Cómo |
|---|---|---|
| I. Compatibilidad de trama | ✅ | No toca tramas ni el pinger |
| II. Buen ciudadano | ✅ | Sin efecto en el ritmo de pings |
| III. Núcleo puro | ✅ | Carga útil y reglas en `Shared/` sin UI, con tests |
| IV. Protocolo único | ✅ | Protocolo del reloj versionado (`v = 1`) en un contrato propio |
| V. Test-first | ✅ | Los tests de `WatchPayloadTests` van antes que el puente y el modelo |
| VI. Simplicidad | ✅ | Sin dependencias; una pantalla; sin sesiones extendidas |
| VII. Paridad iOS | ✅ | Amplía la referencia iOS; la 004 lo marca "no aplica" al subir su commit de referencia (spec, Assumptions) |

## Project Structure

### Documentation (this feature)

```text
specs/005-watch-compass-lite/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/
│   ├── watch-message.md
│   └── watch-ui.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
Shared/                         # compilado en MeshAzimuth y MeshAzimuthWatch
├── Geo.swift                   # MOVIDO sin cambios desde MeshAzimuth/
├── WatchPayload.swift          # WatchAimState + reglas puras
└── CompassShapes.swift         # Needle, Triangle y BeamWedge extraídos de CompassView sin cambios

MeshAzimuth/
├── WatchBridge.swift           # NUEVO
├── AimView.swift               # + publicar el estado (onChange, onDisappear, scenePhase)
├── CompassView.swift           # usa CompassShapes (mismas formas)
└── MeshAzimuthApp.swift        # + WatchBridge en el entorno y activate()

MeshAzimuthWatch/               # NUEVO target watchOS 8
├── MeshAzimuthWatchApp.swift
├── WatchModel.swift
├── WatchHaptics.swift
├── WatchCompassView.swift
├── WatchContentView.swift      # estados de watch-ui.md
├── Theme+Watch.swift           # navy, accent, target (mismos valores que Theme.swift)
└── Assets.xcassets             # ícono del reloj a partir de AppIcon.png

MeshAzimuthTests/
└── WatchPayloadTests.swift     # NUEVO

project.yml                     # + target del reloj, incrustación, Shared/
```

**Structure Decision**: target único de reloj con ciclo de vida SwiftUI (sin extensión WatchKit separada), incrustado en la app iOS. `Shared/` evita duplicar la geodesia y las formas: si el iPhone cambia una regla, el reloj la recibe igual.

## Complexity Tracking

Sin violaciones.
