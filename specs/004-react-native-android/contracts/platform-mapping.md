# Contrato: correspondencia de plataforma iOS → Android

Cada entrada describe una API de iOS que usa la referencia, la API de Android que la reemplaza, en qué **difiere su semántica** y cómo se iguala el comportamiento observable. Las entradas con `C-x` no se implementan hasta resolver esa clarificación de `spec.md`.

Formato: **Origen** (archivo:línea) · **iOS** · **Android** · **Diferencia** · **Resolución** · **Verificación**.

---

### PM-01 Mapa estándar con teselas OSM en caché

- **Origen**: `MapView.swift` L4–41, L96–108.
- **iOS**: `MKTileOverlay` con `canReplaceMapContent`, `URLCache` (20 MB en memoria, 500 MB en disco). Usa la política HTTP normal y, si falla la red, reintenta con `.returnCacheDataDontLoad` (sirve teselas vencidas). Cabecera `User-Agent` propia y `maximumZ = 19`.
- **Android**: motor de mapa según C-3, con una fuente ráster OSM (`tileSize` 256, `maxzoom` 19).
- **Diferencia**: los motores tienen caché propia (por ejemplo, la *ambient cache* de MapLibre, 50 MB por defecto) con su propia política de vencimiento y sin "servir vencido sin red" garantizado.
- **Resolución**:
  - Caché configurada a 500 MB.
  - Política de red "online: revalidar al vencer / offline: servir lo guardado".
  - `User-Agent` exacto `MeshAzimuth/1.0 (co.electrosoftware.meshazimuth)`.
  - Sin precarga.
  - "Caché de mapas" en *Acerca de* = bytes en disco de esa caché; "Borrar caché" la vacía.
  - Si el motor elegido no permite servir vencido sin red, se intercepta la carga de teselas con un manejador propio (equivalente a `loadTile`).
- **Verificación**: modo avión tras recorrer una zona → las teselas siguen visibles; el tamaño reportado crece y vuelve a "Zero KB" tras borrar (FS-10).

### PM-02 Mapa satélite — `C-3`

- **Origen**: `MapView.swift` L97–100.
- **iOS**: `mapType = .hybrid`: imágenes satelitales de Apple con etiquetas y carreteras, solo con red.
- **Android**: no existe Apple Maps.
- **Resolución**: proveedor y motor según C-3. En cualquier caso: el mismo botón y la misma persistencia (`map.satellite`), sin atribución OSM en modo satélite (`ContentView.swift` L49–57) y con la atribución que exija el proveedor elegido (es una obligación legal, no una función nueva).
- **Verificación**: visual con la zona del mapa enmascarada (VA-4).

### PM-03 Seguimiento de usuario

- **Origen**: `TrackingButton.swift`, `MapView.swift` L94, L187–191.
- **iOS**: `MKUserTrackingMode` `.none/.follow/.followWithHeading`. MapKit vuelve a `.none` cuando el usuario arrastra, y gira el mapa con su propio rumbo.
- **Android**: modos de cámara del motor (seguir ubicación / seguir con rumbo).
- **Diferencia**: el rumbo con el que gira el mapa lo calcula el motor con su propio sensor, no con el rumbo suavizado de la app. En iOS también es el de MapKit, no el de la app.
- **Resolución**: usar el modo nativo del motor (equivale a usar el de MapKit) y reflejar cualquier salida del seguimiento por gesto en el estado del botón.
- **Verificación**: manual (arrastrar → el ícono vuelve a `location`).

### PM-04 Proveedor de ubicación

- **Origen**: `LocationManager.swift` L37–44, L65–73, L107–112.
- **iOS**: `kCLLocationAccuracyBest`, `distanceFilter = 2`; descarta `horizontalAccuracy < 0`.
- **Android**: `FusedLocationProviderClient`, `PRIORITY_HIGH_ACCURACY`, `minUpdateDistanceMeters = 2`, intervalo de 1 s.
- **Diferencia**: Android no da precisión negativa, pero puede no tener precisión (`hasAccuracy() == false`).
- **Resolución**: sin precisión → se descarta el fix (equivale a `< 0`). `horizontalAccuracy = accuracy` (radio de 68 %, la misma convención práctica que iOS).
- **Verificación**: unitario del filtro y campo.

### PM-05 Rumbo verdadero

- **Origen**: `LocationManager.swift` L114–138.
- **iOS**: `CLHeading.trueHeading` (≥ 0 solo si Core Location conoce la ubicación), `magneticHeading`, `headingAccuracy` en grados, `headingFilter = 0.5`.
- **Android**: módulo nativo `HeadingModule` (Kotlin):
  - `TYPE_ROTATION_VECTOR` → `getRotationMatrixFromVector` → `getOrientation` → azimut magnético;
  - declinación con `GeomagneticField(lat, lon, altMSL, now)`;
  - verdadero = magnético + declinación.
- **Diferencias**:
  1. "Conoce la ubicación": en iOS cuenta la caché del sistema.
  2. iOS entrega eventos a su propio ritmo y el EMA (α = 0.25 **por evento**) depende de ese ritmo.
  3. `headingFilter` se aplica a lo que entrega Core Location (antes del suavizado de la app).
- **Resolución**:
  1. Hay rumbo verdadero si el sistema tiene **algún** fix (incluido `getLastLocation()` del proveedor fusionado). La ubicación persistida por la app (`location.last`) **no** cuenta, porque Core Location tampoco la conoce.
  2. El ritmo de eventos se ajusta para que la **respuesta a un escalón** del rumbo suavizado coincida con iOS (ver research R-3: se mide en iOS y se fija la tasa de muestreo).
  3. El módulo nativo emite solo cuando el azimut crudo cambia ≥ 0.5° respecto al último emitido.
- **Verificación**: SC-004 (≤ 2° frente a iOS) y prueba de escalón (R-3).

### PM-06 Referencia del rumbo (eje del teléfono)

- **Origen**: `LocationManager.swift` L5–7, L43.
- **iOS**: `headingOrientation = .portrait`: rumbo del borde superior; uso previsto, teléfono plano sobre el boom.
- **Android**: `getOrientation` da el azimut del eje Y con el dispositivo plano.
- **Diferencia**: con el teléfono inclinado hacia vertical, iOS y Android pueden cambiar de eje de referencia de forma distinta.
- **Resolución**: para el teléfono plano (el caso de uso documentado) se usa el eje Y sin remapear. El comportamiento en vertical **no se supone**: se mide en iOS (research R-4) y se replica con `remapCoordinateSystem` si hace falta.
- **Verificación**: SC-004 en plano; R-4 para inclinaciones de 0°, 45° y 80°.

### PM-07 Inclinación del boom

- **Origen**: `MotionManager.swift`.
- **iOS**: `CMMotionManager.deviceMotion.attitude.pitch` (rad → °), 10 Hz, EMA 0.3; positivo = el frente sube.
- **Android**: `HeadingModule` con el mismo vector de rotación: `pitch = −orientation[1]` en grados (en Android el signo es el opuesto: levantar el borde superior da negativo), 10 Hz, EMA 0.3 en JS.
- **Resolución y verificación**: test de signo (levantar el frente 10° → +10 ± 1°) y SC-004.

### PM-08 Altitud sobre el nivel del mar

- **Origen**: `AimInfo.swift` L16–17, `SessionModels.swift` L65, `LocationManager.swift` L45–62.
- **iOS**: `CLLocation.altitude` = altitud **sobre el nivel medio del mar**; `verticalAccuracy < 0` = no válida.
- **Android**: `Location.getAltitude()` = altura sobre el **elipsoide WGS84**. La altitud MSL se obtiene con `getMslAltitudeMeters()` (API 34+) o con `androidx.core:core-location-altitude` (`AltitudeConverterCompat.addMslAltitudeToLocation`) en versiones anteriores.
- **Diferencia**: la ondulación del geoide (decenas de metros en Colombia) pasaría tal cual a la elevación al repetidor, cuya altitud se ingresa en "m s.n.m.".
- **Resolución**: altitud = MSL; precisión vertical = `getMslAltitudeAccuracyMeters()` (o `getVerticalAccuracyMeters()` si el conversor no da precisión); sin altitud o sin precisión → `verticalAccuracy = −1`.
- **Verificación**: en un punto con cota conocida, la altitud mostrada coincide con la de iOS (±5 m).

### PM-09 Biblioteca BLE e identidad del periférico

- **Origen**: `BLELineTransport.swift`.
- **iOS**: CoreBluetooth en una cola propia; `CBPeripheral.identifier` (UUID por teléfono); `retrievePeripherals(withIdentifiers:)`.
- **Android**: `react-native-ble-plx` (o equivalente que dé escaneo con filtro de servicio, conexión, MTU, suscripción y escritura sin respuesta).
- **Diferencias**:
  - el identificador es la dirección MAC;
  - no hay `retrievePeripherals` (se conecta por dirección);
  - Android limita a 5 inicios de escaneo cada 30 s por app;
  - algunos teléfonos no aplican bien el filtro por UUID de 128 bits cuando el UUID va en el scan response (el contrato GATT lo permite).
- **Resolución**:
  - `PingerDevice.id: string` (UUID en iOS, MAC en Android); `pinger.lastDevice` guarda la MAC.
  - Conexión directa por MAC al último usado.
  - Escaneo con filtro de servicio **y** filtro por prefijo de nombre `YagiPinger-` (el que ya aplica Swift en L227). Que el filtro de servicio funcione con el UUID en el scan response **no se supone**: se verifica en los dispositivos objetivo (research R-5). Solo si falla, se escanea sin filtro de servicio y se mantiene el filtro de nombre, que da el mismo resultado observable que iOS.
  - El límite de escaneos se documenta como causa conocida si "Buscar de nuevo" se pulsa más de 5 veces en 30 s.
- **Verificación**: banco con 2 teléfonos Android de fabricantes distintos.

### PM-10 Hápticos

- **Origen**: `Haptics.swift`, `PingerSection.swift` L95.
- **iOS**: CoreHaptics: continuo (intensidad 0.8, nitidez 0.4) de 3 s + transitorios (1.0, 1.0) cada 0.5 s; `UINotificationFeedbackGenerator` `.success`/`.warning`.
- **Android**: `Vibrator` con `VibrationEffect.createWaveform(timings, amplitudes, -1)` si `hasAmplitudeControl()`:
  - 6 ciclos de [40 ms a 255, 460 ms a 204] = 3 s (los transitorios a amplitud máxima sobre el continuo a 0.8 × 255);
  - la nitidez no tiene equivalente en Android.
  - `.success` → `HapticFeedbackConstants.CONFIRM` (API 30+) o `EFFECT_DOUBLE_CLICK`; `.warning` → `REJECT` (API 30+) o `EFFECT_HEAVY_CLICK`.
- **Resolución**: sin control de amplitud se usa el equivalente de `.success`, igual que el fallback de iOS. `stop()` → `vibrator.cancel()`. Mismo bloqueo de reentrada con token.
- **Verificación**: manual (se siente durante 3 s y se corta al desalinear).

### PM-11 Permisos y "Abrir Ajustes"

- **Origen**: `Info.plist`, `PermissionBanner.swift`, `LinkCard.swift` L42–46, `PingerPicker.swift` L53–57.
- **iOS**: un texto de propósito por permiso. La ubicación se pide en `start()` y el Bluetooth al crear `CBCentralManager`. `openSettingsURLString` abre los ajustes de la app.
- **Android**: `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` en el primer `start()`; `BLUETOOTH_SCAN` (`neverForLocation`) + `BLUETOOTH_CONNECT` (API 31+) o `ACCESS_FINE_LOCATION` (API ≤ 30) al primer escaneo o conexión.
- **Diferencias**: Android no muestra el texto de propósito; "Bluetooth apagado" en Android no se arregla desde los ajustes de la app.
- **Resolución**:
  - Mapeo de estados: concedido → `authorizedWhenInUse`; denegado → `denied`; denegado permanentemente → `denied`; sin preguntar → `notDetermined` (en Android no existe `restricted`).
  - "Abrir Ajustes": para `unauthorized` y ubicación denegada → `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`; para `bluetoothOff` → `Settings.ACTION_BLUETOOTH_SETTINGS`. Mismos textos que iOS.
  - No se añade ninguna pantalla de justificación previa (sería una función nueva).
- **Verificación**: manual con cada estado.

### PM-12 MTU y escritura sin respuesta

- **Origen**: `BLELineTransport.swift` L112–128, L203–209, L278.
- **iOS**: MTU negociado automáticamente (≈ 185); `maximumWriteValueLength(.withoutResponse)`; control de flujo con `canSendWriteWithoutResponse`/`peripheralIsReady`.
- **Android**: MTU 23 por defecto.
- **Resolución**:
  - Pedir MTU 247 al conectar (equivale a la negociación automática de iOS); tamaño de trozo = `max(mtu − 3, 20)`.
  - Las escrituras sin respuesta se encadenan en orden (una por operación GATT), lo que equivale al control de flujo de iOS.
- **Verificación**: `bleLineTransport.test.ts` (fragmentación) y banco (líneas de 160 B).

### PM-13 Conectividad

- **Origen**: `NetworkMonitor.swift`.
- **iOS**: `NWPathMonitor`, `status == .satisfied`.
- **Android**: `@react-native-community/netinfo` → `isConnected === true`, **no** `isInternetReachable` (iOS tampoco verifica Internet).
- **Verificación**: modo avión y Wi-Fi sin Internet.

### PM-14 Persistencia clave-valor y archivos

- **Origen**: `UserDefaults` (11 claves, ver `storage-and-files.md`), `SessionStore.swift`, archivos temporales de exportación.
- **Android**: `react-native-mmkv` (síncrono, como `UserDefaults`) con los mismos nombres de clave y tipos; archivos en `filesDir/Sessions` con escritura atómica (temporal + `rename`); exportaciones en `cacheDir`, compartidas con `FileProvider` (`content://`).
- **Verificación**: `storage.test.ts`, que reinicia la app y comprueba cada clave.

### PM-15 Arranque e ícono

- **Origen**: `UILaunchScreen: {}`, `AppIcon.png` (1024, con fondo).
- **Android**: desde Android 12 la pantalla de arranque del sistema siempre existe y muestra el ícono.
- **Resolución**: fondo de arranque = color de fondo del sistema según el modo (`#000000` oscuro / `#FFFFFF` claro, como el arranque vacío de iOS) e ícono transparente; es lo más parecido a un arranque vacío. Ícono adaptativo: fondo `#011949` y como primer plano el arte del PNG reescalado dentro de la zona segura de 66 dp; ícono heredado (redondo y cuadrado) a partir del PNG.
- **Verificación**: revisión visual del lanzador.

### PM-16 Lista con búsqueda, deslizamiento y menú

- **Origen**: `RepeaterViews.swift` L39–92.
- **iOS**: `searchable` (barra bajo el título), `swipeActions` (fin: borrar con deslizamiento completo; inicio: editar), `Menu` con `Picker` (selección con check).
- **Android**: componentes propios que reproducen los de iOS (FR-060) con `react-native-gesture-handler`.
- **Resolución**: mismos umbrales de deslizamiento completo que iOS (más de la mitad del ancho de la fila); el menú se abre anclado al botón "…", como el `UIMenu`.
- **Verificación**: visual (estados `list-swipe-delete`, `list-swipe-edit`, `list-menu`).

### PM-17 Teclados

- **Origen**: `RepeaterViews.swift` L147–158.
- **iOS**: `numbersAndPunctuation` (lat/lon), `decimalPad` (altitud, sin signo menos), `characters` + sin autocorrección (hash).
- **Android**: `numbers-and-punctuation` no existe.
- **Resolución**: lat/lon → `keyboardType="default"` (el único que garantiza `-`, `,` y `.` en todos los teclados); altitud → `decimal-pad`; hash → `autoCapitalize="characters"`, `autoCorrect={false}`. El parseo es el mismo (FS-09).
- **Verificación**: manual.

### PM-18 Botón/gesto Atrás de Android

- **Origen**: no existe en iOS.
- **Resolución** (equivale al gesto de cierre de iOS en cada contexto, sin funciones nuevas):

| Contexto | iOS | Atrás en Android |
|---|---|---|
| Hoja (editor, lista, acerca de, selector, sesión) | deslizar hacia abajo = cerrar sin guardar | cerrar sin guardar |
| Pantalla de sesión dentro de la hoja | botón "<" de navegación | volver a la lista de sesiones |
| Apuntamiento (pantalla completa) | solo "Listo" | igual que "Listo" |
| Guía en el primer arranque | no descartable | ignorado |
| Guía desde *Acerca de* | no descartable | ignorado |
| Diálogo de confirmación o menú | tocar fuera = cancelar | cancelar |
| Mapa (raíz) | — | comportamiento del sistema (salir) |

### PM-19 Barras del sistema

- **Origen**: `ContentView.swift` L73–75 (barra navy, contenido claro), iOS sin barra inferior opaca.
- **Android**: modo de borde a borde (obligatorio con `targetSdk 35`): barra de estado transparente, íconos claros sobre navy u oscuro y oscuros en claro, barra de navegación transparente. El contenido respeta las áreas seguras igual que en iOS.
- **Verificación**: VA-3 (máscaras de las barras del sistema).

### PM-20 Presentación de hojas y pantallas completas

- **Origen**: `.sheet`, `.fullScreenCover`, `.confirmationDialog`, `.alert`.
- **iOS 26**: hoja de página con esquinas superiores redondeadas, inset y desplazamiento hacia abajo para cerrar; pantalla completa con deslizamiento desde abajo; diálogo de acción desde abajo; alerta centrada.
- **Android**: modales propios que reproducen geometría, animaciones (duración y curva medidas en grabaciones de iOS, R-6) y gestos.
- **Verificación**: visual (estados de hoja) y revisión de grabaciones lado a lado.

### PM-21 Fechas según la configuración regional

- Ver FS-07 y C-9.

### PM-22 Tamaño de texto del sistema

- **iOS**: Dynamic Type escala los estilos de texto.
- **Android**: `fontScale` del sistema.
- **Resolución**: los estilos de texto escalan con `fontScale`. La aceptación pixel perfect solo vale con `fontScale = 1.0` (iOS "Large").

### PM-23 Accesibilidad

- **Origen**: `accessibilityLabel` en la brújula y en el botón de seguimiento; el resto son textos visibles.
- **Android**: `accessibilityLabel` con los mismos textos; TalkBack lee lo mismo que VoiceOver en esos dos controles.
