# MeshAzimuth — Android (React Native)

Port directo de la app iOS (`../MeshAzimuth`, referencia fijada en `120m4n/YagiAim@2eda6d9`). Spec: `../specs/004-react-native-android/`.
Expo (prebuild + development build), TypeScript estricto, Hermes, nueva arquitectura; tres módulos Kotlin propios en `modules/`.

## Estructura
- `src/core/` — núcleo puro, sin React ni nativo (lo hace cumplir ESLint): geodesia, codec de líneas, reglas de sesión, CSV, `formatC`, parseo de Swift, JSON de Swift, fechas, tamaño de caché.
- `src/state/`, `src/link/`, `src/session/` — servicios (tiendas Zustand), pinger BLE y simulado, grabación de sesiones.
- `src/platform/` — MMKV, archivos, compartir, permisos, hápticos. `src/native/` — contratos TS de los módulos Kotlin.
- `src/ui/` — sistema de diseño iOS (colores, tipografía, íconos propios, componentes). `src/screens/` — pantallas.
- `modules/heading` (FOP, vector de rotación, pitch), `modules/altitude` (MSL), `modules/haptics` (forma de onda).

## Comandos
```bash
npm ci
npm test            # Jest: 46 tests portados + paridad con los dorados de Swift + enlace/sesión/estado
npm run lint        # prohíbe toFixed/Number/parseFloat/parseInt en src/ y react-native en src/core
npm run typecheck
npm run prebuild    # genera android/ (CNG)
npm run android     # development build en un dispositivo (necesita el SDK de Android)
```

## Regenerar los dorados (solo macOS)
`npm run goldens` compila `tools/goldens/main.swift` **junto a** los fuentes Swift de la referencia, sin modificarlos, y reescribe
`__tests__/goldens/swift-goldens.json`. Hay que repetirlo y revisar la matriz de paridad si cambia el commit de referencia.

## Íconos
`node tools/icons/build.mjs` regenera `src/ui/icons/glyphs.ts` a partir de Lucide (`lucide-static`) para los símbolos de `contracts/inventory/symbols.tsv`.

## Estado
Ver `../specs/004-react-native-android/tasks.md`. Pendiente de dispositivo/emulador: compilación nativa y pruebas de campo (`bench-log.md`), y la suite visual (`visual/README.md`).
