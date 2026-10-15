# Contrato: aceptación visual "pixel perfect"

Decisiones aplicadas (sesión de clarificación del 2026-10-14):
- **C-10**: estricto en geometría y color, flexible en la forma de los glifos.
- **C-8**: no se añade nada a la app iOS.
- **C-9**: región `es_CO`.

## VA-1 Referencia iOS

| Atributo | Valor | Fuente |
|---|---|---|
| Resolución | 1290 × 2796 px = 430 × 932 pt @3x | medido en `docs/img/*.png` |
| Perfil de color | Display P3 (ICC embebido) | medido |
| Sistema | iOS 26 (Liquid Glass) | apariencia de las capturas |
| Modo | oscuro (la barra del mapa y el panel están forzados a oscuro en cualquier modo) | capturas |
| Tamaño de texto | "Large" (por defecto) | supuesto razonable para una app sin ajustes de texto |
| Región de las capturas | distinta de `es_CO` (la fecha se ve como `14 Oct 2026 at 5:28 PM`) | captura 09 |

**Capturas existentes y su uso:**

| Archivo | Estado (`ui-spec.md` §3) | Uso |
|---|---|---|
| `01-mapa.png` | `map-selected-satellite` | solo lo que dibuja la app sobre el mapa (VA-4) |
| `02-editor-hash.png` | `editor-edit` | completo |
| `03-apuntar.png` | `aim-turn-*` | completo |
| `04-selector.png` | `picker-found` | completo |
| `05-enlace-vivo_01.png` | `link-connected-empty` | completo |
| `05-enlace-vivo_02.png`, `_03.png` | `link-live` | completo; la sparkline se compara si los valores inyectados reproducen la serie, si no se enmascara |
| `06-alineado.png` | `aim-aligned` | completo |
| `07-midiendo.png` | `measure-progress` | completo |
| `08-lectura.png` | `measure-reading` | completo |
| `09-sesion.png` | `sessions-current` | completo salvo el texto de la fecha (otra región, VA-4) |
| `10-csv.png` | `session-detail` + hoja de compartir | solo la zona de la app (VA-4) |
| `00-montaje.png` | foto del montaje | no se usa |
| `design/screenshots/*.png` | versión anterior ("YagiAim", sin tema) | **no son referencia** |

**Valores de cada captura**: para que la comparación sea determinista, cada estado Android se prepara con los valores que muestra su captura (repetidor, azimut, rumbo, distancia, inclinación, precisiones, tolerancia, nombre y firmware del pinger, métricas, progreso, lectura…). Se leen de la imagen y se guardan en `android-rn/visual/states/<estado>.json` (tarea T131). No se infiere ningún valor que la captura no muestre: lo que no se ve se fija libremente y su zona, si se ve afectada, se enmascara.

**Nuevas capturas iOS (opcional, sin tocar la app)**: cualquier captura adicional tomada a mano en un iPhone de 430 × 932 pt, en modo oscuro, tamaño de texto "Large", y con el nombre del estado de `ui-spec.md` §3 (`docs/img/<estado>.png`) pasa a ser referencia en la siguiente ejecución, junto con su `states/<estado>.json`.

## VA-2 Dispositivo Android de referencia

AVD con perfil de hardware propio:
- pantalla de 1290 × 2796 px a 480 dpi (430 × 932 dp);
- imagen del sistema de API 35 (Google APIs, x86_64, con Play Services para FOP y la ubicación fusionada);
- navegación por gestos;
- `font_scale 1.0`;
- modo oscuro;
- región **`es-CO`**;
- modo demo de la interfaz del sistema.

```bash
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0527
adb shell cmd uimode night yes
adb shell settings put system font_scale 1.0
adb shell cmd locale set-app-locales co.electrosoftware.meshazimuth --locales es-CO
```

## VA-3 Alineación y recorte

1. Ambas imágenes se recortan por debajo de su área segura superior y por encima de la inferior. iOS: 59 pt / 34 pt en este modelo, verificado midiendo en las capturas el borde inferior de la barra de estado y el del indicador de inicio. Android: los insets que reporta `WindowInsets` en el AVD.
2. Tras el recorte, el contenido de la app empieza en el mismo origen. Las barras del sistema no se comparan.
3. Si las alturas recortadas difieren, el excedente inferior se enmascara. El criterio (c) de VA-6 detecta cualquier desplazamiento real del contenido.

## VA-4 Máscaras

| Máscara | Estados | Motivo |
|---|---|---|
| Teselas del mapa | `map-*` | los proveedores de imágenes son distintos por fuerza (PM-02). Se compara lo que dibuja la app encima: barra, botón de seguimiento, brújula y escala del mapa, marcadores, línea, panel, cápsula, banners y atribución |
| Texto de la fecha | `sessions-*`, `session-detail` | las capturas son de otra región; el texto se verifica con el dorado de `es_CO` (FS-07) |
| Hoja de compartir del sistema | `session-detail` (captura 10) | interfaz del sistema operativo |
| Teclado | estados del editor con foco | teclado del sistema |

## VA-5 Color

- Las referencias se convierten de Display P3 a sRGB (transformación ICC, intención colorimétrica relativa) antes de comparar.
- Comprobación del proceso: el accent medido en la referencia convertida debe dar `#2E8CFF` ±2 por canal (medido: `#2D8CFF`).

## VA-6 Criterio de aceptación (C-10, aprobado)

**Estricto en geometría y color, flexible en la forma de los glifos.** Por estado:

| # | Criterio | Umbral |
|---|---|---|
| (a) | Posición y tamaño de cada elemento con `testID` (cajas medidas en la captura iOS por segmentación y anotadas una vez en `states/<estado>.json`, frente a las cajas de la jerarquía de vistas de Android) | ±1 dp |
| (b) | Color de relleno de cada elemento (muestra en el centro de su caja, fuera de glifos) | ΔE2000 ≤ 2 |
| (c) | Cajas de texto: ancho, alto y línea base de cada texto | ancho ±2 %; alto y línea base ±1 dp |
| (d) | Cajas de íconos: tamaño y centro | ±1 dp |
| (e) | Píxeles distintos **fuera de los glifos** (texto e íconos excluidos con sus cajas dilatadas 1 dp; pixelmatch, umbral YIQ 0.1, antialiasing excluido) | ≤ 0.5 % del área comparada |
| (f) | Mayor mancha conexa de diferencia fuera de los glifos | ≤ 12 × 12 dp |

Los estados sin captura iOS no se comparan contra iOS. Se comparan contra su **línea base Android aprobada** (VA-9), con los mismos criterios (a)–(f) y umbral (e) ≤ 0.1 %, que actúa como prueba de regresión.

## VA-7 Inyección determinista (solo en Android)

Variante de compilación `visualTest`, que **no** existe en el build de tienda, con proveedores falsos inyectados en los mismos puntos que el código de producción: ubicación (incluida la altitud MSL y las precisiones), rumbo y precisión, inclinación, red, reloj (`2026-10-14T17:28:00-05:00`), pinger (`SimulatedPinger` con semilla o un transporte de guion con líneas exactas), estado de Bluetooth y dispositivos escaneados, secuencia de UUID y animaciones de duración 0. La app iOS no se modifica.

## VA-8 Herramientas

- Android: Maestro (un flujo por estado) + `adb exec-out screencap -p`.
- Comparación: Node + `pixelmatch` + `sharp` (perfiles ICC), con segmentación de cajas a partir de `testID` en Android y de las anotaciones de `states/*.json` en iOS.
- Informe HTML con referencia, captura, diferencias, métricas (a)–(f) y veredicto.
- `npm run visual` sale con 1 si algún estado no cumple.

## VA-9 Estados y líneas base

- **Contra iOS**: los 11 estados con captura de VA-1 (12 imágenes: `link-live` tiene dos; `aim-turn-*` es el sentido que muestre la captura 03).
- **Contra la línea base aprobada**: los 50 restantes de los 61 de `ui-spec.md` §3. La línea base se genera una vez y la **aprueba el dueño del producto** en una revisión lado a lado con la app iOS en un iPhone (sin modificar la app), registrada en `visual/approvals.md` con fecha, estado y commit. Desde entonces, cualquier cambio visual exige volver a aprobar.
- Modo: oscuro, como las referencias. El modo claro funciona (la app sigue al sistema, con los colores de sistema de iOS publicados por Apple), pero no forma parte de la aceptación pixel perfect por no haber referencias.
