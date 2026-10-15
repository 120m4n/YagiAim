# Implementation Plan: Port de MeshAzimuth a React Native (Android)

**Branch**: `004-react-native-android` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-react-native-android/spec.md`

**Commit de referencia (fijado)**: `120m4n/YagiAim@2eda6d9`. Cambiarlo es un PR propio que regenera los inventarios (`contracts/inventory/inventory.py`) y los dorados (`tools/goldens`) y revisa la matriz de paridad.

## Summary

Traspaso literal de la app iOS a React Native con Android como único destino:
- el núcleo puro se porta a TypeScript con los mismos tests y fixtures;
- los servicios observables se convierten en tiendas con la misma API;
- los sensores y el BLE pasan a módulos nativos y bibliotecas equivalentes, con las divergencias registradas;
- la UI se reconstruye con componentes propios que imitan iOS 26.

La aceptación es doble: paridad funcional (tests, dorados, banco) y paridad visual (capturas en un AVD del mismo tamaño lógico que el iPhone de referencia).

## Technical Context

**Language/Version**: TypeScript 5 (estricto) sobre React Native con la nueva arquitectura + Hermes; Kotlin para los módulos nativos; Swift solo para generar los dorados.

**Primary Dependencies**: Expo (prebuild + development build), `react-native-ble-plx`, `react-native-mmkv`, `@shopify/react-native-skia`, `react-native-gesture-handler`, `react-native-reanimated`, `@react-native-community/netinfo`, motor de mapa según C-3, `androidx.core:core-location-altitude`, Google Play Services Location. Ninguna de analítica ni de red adicional (FR-053).

**Storage**: MMKV (claves de SF-01), archivos en `filesDir/Sessions` y `cacheDir`.

**Testing**: Jest (núcleo, paridad y contratos), Maestro + pixelmatch (visual), banco y campo con registro.

**Target Platform**: Android, `minSdk 26` / `targetSdk 35` (C-11), teléfonos, solo vertical.

**Project Type**: app móvil (port).

**Performance Goals**: los de la referencia (SC-006): conexión ≤ 1.0 s, ping ≤ 1.6 s; interfaz a 60 fps durante "En vivo".

**Constraints**: cero funciones nuevas; cero divergencias sin registrar; sin cambios en firmware ni en contratos 001–003; la app iOS no se modifica (salvo C-8 a, solo DEBUG).

**Scale/Scope**: 31 archivos Swift → unos 45 módulos TS/TSX + 2 módulos Kotlin; 46 tests portados más los de paridad; 61 estados visuales.

## Constitution Check

| Principio | Cumple | Cómo |
|---|---|---|
| I. Compatibilidad de trama | ✅ | El port no construye tramas RF; habla `proto=1` con el pinger validado. El codec se valida con los mismos fixtures |
| II. Buen ciudadano | ✅ | Igual que iOS: nunca `GO`, intervalo ≥ 2 s, `PING` uno a uno. El firmware sigue imponiendo sus límites |
| III. Núcleo puro | ✅ | `src/core/` sin React ni nativo; regla de lint que prohíbe importar `react-native` ahí |
| IV. Protocolo único | ✅ | Lee `MeshAzimuthTests/Fixtures/lines` directamente; `sync_fixtures.sh` sigue siendo la única copia |
| V. Test-first | ✅ | Los 46 tests portados se escriben antes que el núcleo (fase 2 de tasks) |
| VI. Simplicidad | ✅ | Dependencias justificadas en research R-1…R-11; sin persistencia nueva |
| VII. Paridad iOS | ✅ | Matriz de paridad, correspondencia de plataforma, dorados de Swift, suite visual; las clarificaciones C-1…C-11 bloquean solo sus partes |

## Project Structure

### Documentation (this feature)

```text
specs/004-react-native-android/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── checklists/requirements.md
└── contracts/
    ├── parity-matrix.md        # Swift → TS, fila por comportamiento
    ├── platform-mapping.md     # PM-01…PM-23
    ├── format-semantics.md     # FS-01…FS-12
    ├── storage-and-files.md    # SF-01…SF-05
    ├── ui-spec.md              # tokens, componentes, pantallas, estados
    ├── visual-acceptance.md    # VA-1…VA-9
    └── inventory/              # generado: strings, symbols, fonts, keys + inventory.py
```

### Source Code (repository root)

```text
android-rn/
├── app.json  package.json  tsconfig.json  jest.config.js  .eslintrc.js
├── App.tsx
├── src/
│   ├── core/            # geo, aimInfo, lineCodec, lineAssembler, sessionModels, sessionCsv,
│   │                    # formatC, swiftParse (Double/Int), swiftDescribe, swiftJson, swiftDate,
│   │                    # byteCount, dateStyle, repeater, splitmix64, yagiGain, uuid
│   ├── state/           # providers, repeaterStore, locationStore, motionStore, networkStore
│   ├── link/            # lineTransport, bleLineTransport, simulatedPinger, pingerLink, pingerScanner
│   ├── session/         # sessionRecorder, sessionStore
│   ├── platform/        # kv (MMKV), files, share, documentPicker, haptics, keepAwake, settings, permissions
│   ├── native/          # contratos TS de los módulos Kotlin (heading, altitude)
│   ├── ui/
│   │   ├── theme.ts  typography.ts  colors.ts
│   │   ├── icons/       # 33 glifos (C-1)
│   │   └── ios/         # NavBar, GlassCapsule, Sheet, FullScreen, GroupedList, Row, Switch, Slider,
│   │                    # ProminentButton, BorderedButton, ConfirmationDialog, Alert, Menu, SwipeRow,
│   │                    # SearchBar, ContentUnavailable, ActivityIndicator, PageControl, Material, NumericText
│   └── screens/         # MapScreen, map/{MapView,TrackingButton}, OnboardingScreen, AboutScreen,
│                        # RepeaterListScreen, RepeaterEditorScreen, AimScreen, aim/{CompassView,PingerSection,
│                        # LinkCard,Sparkline}, PingerPickerScreen, SessionSheet, SessionView, PermissionBanner
├── modules/
│   ├── heading/         # Kotlin: vector de rotación, declinación, precisión, pitch (PM-05…07)
│   └── altitude/        # Kotlin: MSL (PM-08)
├── __tests__/
│   ├── core/            # 46 portados + format-semantics + goldens
│   ├── link/  session/  state/
│   └── goldens/swift-goldens.json
├── tools/goldens/main.swift
└── visual/              # flujos Maestro, zones.json, comparador, informe
```

**Structure Decision**: Proyecto separado `android-rn/` en el mismo repo, para leer los fixtures y las capturas sin copiarlos y para que el commit de referencia y el port viajen juntos. La organización de carpetas sigue los archivos Swift (matriz de paridad) para facilitar la revisión línea a línea.

## Orden de construcción

1. **Bloqueantes de decisión**: C-1, C-2, C-3, C-5 y C-8 condicionan la UI, el mapa, los sensores y la suite visual; C-11 condiciona el arranque. El núcleo (US1) no depende de ninguna y empieza ya.
2. US1 (núcleo) → US4 (enlace con el simulador; la UI básica puede ir sin estilo) → US2/US3 → US5 → US6 transversal desde el día uno en cuanto haya C-8.

## Complexity Tracking

| Elemento | Por qué | Alternativa más simple rechazada porque |
|---|---|---|
| Componentes iOS propios en lugar de Material | "Pixel perfect" respecto a iOS | Material no se parece a las capturas: falla VA-6 por diseño |
| `formatC`, `parseSwiftDouble`, `swiftDoubleDescription` propios | `toFixed`/`Number`/`String` dan textos distintos en casos que la app ejerce (FS-01, FS-02, FS-09) | Las funciones de JS rompen la paridad del CSV y de la UI |
| SplitMix64 con `BigInt` | Misma secuencia que Swift (SC-007) | Los `number` de JS pierden precisión en 64 bits |
| Módulos Kotlin propios | Rumbo verdadero con precisión en grados, pitch y altitud MSL equivalentes a iOS | Las bibliotecas genéricas dan precisión en niveles y altitud elipsoidal |
