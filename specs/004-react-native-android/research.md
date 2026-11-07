# Research: 004 Port a React Native (Android)

Cada decisión indica si es **técnica** (de implementación, sin efecto observable) o si **depende de una clarificación** de `spec.md`. Las técnicas no cambian lo que ve el usuario; si alguna lo hiciera, pasa a `platform-mapping.md`.

## R-1 Base del proyecto — técnica

**Decision**: React Native con la nueva arquitectura y Hermes, sobre Expo (prebuild / CNG + *development build*), con módulos nativos propios en Kotlin mediante la Expo Modules API. Versiones: la última estable de RN/Expo al iniciar T001, fijadas exactas en `package.json`.

**Rationale**: hacen falta código nativo (sensores, altitud MSL, vibración con forma de onda, `FileProvider`) y *config plugins* para el manifiesto. Expo los da sin perder el control del proyecto Android. Hermes trae `Intl.Segmenter`/`Collator`, que FS-08 y FS-11 necesitan; se verifica en T005.

**Alternatives considered**: RN "bare" (más mantenimiento de Gradle sin ventaja aquí); Kotlin nativo puro (no es lo que se pidió).

## R-2 Estado observable — técnica

**Decision**: cada clase `@Observable` de Swift (`LocationManager`, `RepeaterStore`, `MotionManager`, `PingerLink`, `SessionRecorder`, `NetworkMonitor`, `PingerScanner`) se traduce a una clase TS con estado observable (Zustand con `subscribeWithSelector`), creada una sola vez en `providers.tsx`, igual que `MeshAzimuthApp`.

**Rationale**: la lógica asíncrona (`PingerLink`, `SessionRecorder`) vive fuera de los componentes, como en Swift, y se prueba sin React. El hilo único de JS equivale a `@MainActor`. Las colas propias de iOS (`BLELineTransport.queue`, el actor `Engine`) se traducen a una serialización explícita (cola de promesas), para conservar el orden de eventos.

## R-3 Respuesta del rumbo suavizado — medir en iOS

**Pregunta**: el EMA α = 0.25 se aplica **por evento** de `CLHeading`, así que la constante de tiempo depende de cuántos eventos entrega iOS (`headingFilter = 0.5°`).

**Método**: en iOS, registrar `rawHeading` con su marca de tiempo durante un giro brusco de 30° (teléfono sobre un plato giratorio con tope) y calcular el tiempo al 90 %. Repetir 10 veces. En Android, ajustar la tasa del sensor y el filtro de 0.5° hasta que el tiempo al 90 % coincida ±20 %.

**Salida**: tasa de muestreo fijada en `HeadingModule` y el registro de medidas en `bench-log.md`.

## R-4 Rumbo con el teléfono inclinado — medir en iOS

**Pregunta**: qué eje de referencia usa `CLHeading` con `headingOrientation = .portrait` a 0°, 45° y 80° de inclinación (plano → vertical).

**Método**: iPhone y Android sobre la misma escuadra apuntando a un objetivo de azimut conocido, en los tres ángulos. Registrar "Rumbo teléfono" en ambos.

**Salida**: si en 45° y 80° difieren más de 2°, se ajusta `remapCoordinateSystem` en `HeadingModule` hasta igualar a iOS (PM-06).

## R-5 Filtro de escaneo BLE por UUID de 128 bits — medir en Android

**Pregunta**: si `ScanFilter.setServiceUuid(NUS)` encuentra al pinger cuando el UUID va en el scan response (lo permite el contrato GATT), en al menos 2 teléfonos de fabricantes distintos (por ejemplo Pixel y Samsung).

**Salida**: decide si se activa el escaneo sin filtro de servicio (PM-09).

## R-6 Tiempos de animación del sistema — medir en iOS

**Método**: grabar la pantalla del iPhone a 60 fps presentando y cerrando una hoja, la pantalla completa, el diálogo de confirmación, la alerta, el menú y el cambio de página de la guía. Extraer la duración y la curva (posición por fotograma).

**Salida**: tabla de duraciones y curvas usada por los componentes de FR-060.

## R-7 Motor de mapa — decidido (C-3)

| Criterio | react-native-maps (Google) | MapLibre React Native |
|---|---|---|
| Satélite | Google híbrido (API key + facturación) | proveedor ráster que se elija (Esri, MapTiler…) |
| OSM ráster | `UrlTile` sobre `mapType="none"` | fuente ráster nativa |
| Caché de 500 MB, vencidas sin red | `tileCachePath`/`tileCacheMaxAge` (control limitado) | *ambient cache* configurable + offline |
| Seguimiento con rumbo | sí | sí (componente de ubicación) |
| Coherencia con tu stack | — | tu decisión registrada de migrar tus proyectos GIS a MapLibre |

**Decision**: MapLibre RN. El modo estándar usa las mismas teselas OSM que iOS. El satélite tiene que ser libre, sin API key ni pago: EOX Sentinel-2 cloudless 2016 (CC BY 4.0) con vías y rótulos vectoriales de OpenFreeMap (sin registro ni API key, uso comercial permitido). Se descartaron Google (requiere cuenta con facturación), Esri World Imagery (requiere cuenta de desarrollador ArcGIS) y MapTiler (requiere API key). Divergencia aceptada en PM-02 (10 m de resolución).

## R-8 Fuentes e íconos — decidido (C-1, C-2)

Las licencias de SF Pro y SF Symbols restringen su uso a plataformas Apple. Esto bloquea un pixel perfect literal en Android y es la causa de C-1 y C-2. **Decision**: Inter + trazos propios para N/E/S/O + JetBrains Mono (PM-26); 33 íconos propios sobre Lucide/Phosphor (PM-25). Como VA-6 excluye el interior de los glifos, lo que se calibra es la **caja**: el tracking de Inter (T060) y el tamaño óptico de cada ícono (T050).

## R-9 Biblioteca BLE — técnica

**Decision**: `react-native-ble-plx`. Cubre escaneo con filtro de UUID, estado del adaptador, conexión por id, `requestMTU`, descubrimiento, `monitorCharacteristicForService` (notificaciones), `writeCharacteristicWithoutResponseForService` y avisos de desconexión. Todo lo que usa `BLELineTransport.swift`.

## R-10 Clave-valor — técnica

**Decision**: `react-native-mmkv` (síncrono, como `UserDefaults`, para que `RepeaterStore.init` y `LocationManager.init` lean antes del primer render, igual que en Swift).

## R-11 Dibujo vectorial y materiales — técnica

**Decision**: `@shopify/react-native-skia` para la brújula (trazos, arcos, texto rotado), la sparkline y los fondos de material (`BackdropBlur` + tinte). Un solo motor de raster para todo lo dibujado a mano da un antialiasing más estable entre capturas.

## R-12 Escala automática de Swift Charts — medir en iOS

**Pregunta**: el dominio Y automático (si incluye el cero), la selección de marcas, el formato de las etiquetas y la posición del eje (por defecto a la derecha) de `Chart { LineMark }` con `chartXAxis(.hidden)`.

**Método** (sin tocar la app iOS, C-8): el generador de dorados de macOS renderiza `Chart { LineMark }` con `.chartXAxis(.hidden)` y la misma altura de 56 pt mediante `ImageRenderer`, con 4 series conocidas: todas positivas (+8…+11), todas negativas (−12…−6), cruzando el cero y una constante. Además se mide el dominio y las marcas visibles en las capturas 05_02 y 05_03. Swift Charts en macOS y en iOS comparten el algoritmo de escala; el estilo de las etiquetas se toma de las capturas iOS.

**Salida**: algoritmo de dominio y marcas reproducido en `Sparkline.tsx`, con tests de las 4 series contra las capturas.

## R-13 Vectores dorados en Swift — técnica

**Decision**: programa `tools/goldens/main.swift` compilado con `swiftc` **junto a** los archivos fuente de la referencia (sin modificarlos ni crear un target nuevo en el proyecto iOS). Genera `swift-goldens.json` (FS-01…FS-12, SplitMix64, JSON de repetidores y sesiones, `ByteCountFormatter`, `Date.formatted`). Los dorados se regeneran al cambiar el commit de referencia.

## R-14 Estrategia de pruebas de paridad — técnica

- **Unitarias puras**: los 46 portados más los de formato (FS).
- **Paridad de comportamiento** de `PingerLink`, `SessionRecorder` y `SimulatedPinger`: tests nuevos con temporizadores falsos. No cambian ninguna función; verifican tiempos, órdenes y estados citando las líneas de Swift.
- **Contrato BLE**: mock de `BleManager` que entrega notificaciones fragmentadas y desconexiones.
- **Campo y banco**: SC-004 y SC-006 con hojas de registro en `bench-log.md`.
- **Visual**: VA-1…VA-9.
