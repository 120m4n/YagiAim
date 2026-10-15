# Contrato: aceptación visual "pixel perfect"

## VA-1 Referencia iOS

| Atributo | Valor | Fuente |
|---|---|---|
| Resolución | 1290 × 2796 px = 430 × 932 pt @3x | medido en `docs/img/*.png` |
| Perfil de color | Display P3 (ICC embebido) | medido |
| Sistema | iOS 26 (Liquid Glass: barras con cápsulas de vidrio, deslizador e interruptor nuevos) | apariencia de las capturas |
| Modo | oscuro (la barra del mapa y el panel están forzados a oscuro en cualquier modo) | capturas |
| Tamaño de texto | "Large" (por defecto) | supuesto: confirmar al capturar |
| Región | la del iPhone de referencia; la fecha se ve como `14 Oct 2026 at 5:28 PM` | C-9 |

**Capturas existentes y su estado:**

| Archivo | Estado (`ui-spec.md` §3) | Uso |
|---|---|---|
| `01-mapa.png` | `map-selected-satellite` | solo zonas fuera del mapa (VA-4) |
| `02-editor-hash.png` | `editor-edit` | completo |
| `03-apuntar.png` | `aim-turn-*` | completo, con sensores en los valores de la captura (C-8) |
| `04-selector.png` | `picker-found` | completo |
| `05-enlace-vivo_01.png` | `link-connected-empty` | completo |
| `05-enlace-vivo_02.png`, `_03.png` | `link-live` | valores en vivo enmascarados si no son deterministas |
| `06-alineado.png` | `aim-aligned` | completo |
| `07-midiendo.png` | `measure-progress` | completo |
| `08-lectura.png` | `measure-reading` | completo |
| `09-sesion.png` | `sessions-current` | completo |
| `10-csv.png` | `session-detail` con la hoja de compartir del sistema | solo la zona de la app; la hoja de compartir del sistema se enmascara (es interfaz del sistema operativo) |
| `00-montaje.png` | foto del montaje | no es una pantalla: no se usa |
| `design/screenshots/*.png` | versión anterior ("YagiAim", sin tema) | **no son referencia** |

El resto de estados de `ui-spec.md` §3 necesitan capturas nuevas, que se obtienen según C-8.

## VA-2 Dispositivo Android de referencia

AVD con perfil de hardware propio:
- pantalla de 1290 × 2796 px a 480 dpi (430 × 932 dp, el mismo tamaño lógico que la referencia);
- imagen del sistema de API 35 (Google APIs, x86_64);
- navegación por gestos;
- `font_scale 1.0`;
- modo oscuro o claro según el estado;
- región según C-9;
- modo demo de la interfaz del sistema (`sysui_demo_allowed 1`, reloj fijo, batería y señal fijas).

```bash
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0527
adb shell cmd uimode night yes
adb shell settings put system font_scale 1.0
```

## VA-3 Alineación y recorte

1. Ambas imágenes se recortan **por debajo de su área segura superior** y **por encima de su área segura inferior**. iOS: 59 pt / 34 pt en este modelo (se confirman con XCUITest). Android: los insets que reporta `WindowInsets` en el AVD.
2. Después del recorte, el contenido de la app de las dos plataformas empieza en el mismo origen. Las barras del sistema no se comparan (son del sistema operativo).
3. Si las alturas recortadas difieren, el excedente inferior se enmascara. Que el contenido de la app termine más arriba o más abajo lo detecta VA-6 (c).

## VA-4 Máscaras

| Máscara | Cuándo | Motivo |
|---|---|---|
| Teselas del mapa | todos los estados `map-*` | los proveedores de imágenes son distintos por fuerza (C-3). Se compara solo lo que dibuja la app encima: barra, botón de seguimiento, brújula y escala del mapa, marcadores, línea, panel, cápsula, banners y atribución |
| Valores en vivo | solo si la referencia no es determinista (C-8 opción b) | números de SNR, RSSI, RTT y rumbo |
| Hoja de compartir del sistema | `10-csv` | interfaz del sistema operativo |
| Teclado | estados del editor con el foco en un campo | teclado del sistema |

## VA-5 Color

- Las referencias se convierten de **Display P3 a sRGB** (transformación ICC, intención colorimétrica relativa) antes de comparar. Las capturas de Android son sRGB.
- Verificación del proceso: `#2E8CFF` (accent) medido en la referencia convertida debe dar ±2 por canal (medido: `#2D8CFF`).

## VA-6 Umbrales (propuestos, a aprobar en C-10)

Por estado, sobre el área no enmascarada:

| Criterio | Zona "plana/texto" | Zona "material/vidrio" (`.regularMaterial`, `.thinMaterial`, cápsulas de barra, deslizador, interruptor) |
|---|---|---|
| (a) píxeles distintos (pixelmatch, umbral YIQ 0.1, antialiasing detectado y excluido) | ≤ 0.5 % | ≤ 2 % |
| (b) mayor mancha conexa de diferencia | ≤ 24 × 24 dp | ≤ 48 × 48 dp |
| (c) posición de los elementos con `testID` (cajas de iOS por XCUITest frente a cajas de Android por la jerarquía de vistas) | ±1 dp | ±2 dp |
| (d) color medio de cada elemento con `testID` (ΔE2000) | ≤ 2 | ≤ 4 |

Las zonas "material/vidrio" se declaran por estado en `android-rn/visual/zones.json`.

## VA-7 Inyección determinista (solo en builds de prueba)

Variante de compilación `visualTest`, que **no** existe en el build de tienda, con proveedores falsos inyectados en los mismos puntos que el código de producción:

| Proveedor | Valores controlados |
|---|---|
| Ubicación | lat, lon, altitud MSL, precisión horizontal y vertical, `isCachedLocation`, autorización |
| Rumbo | rumbo crudo, precisión, `usingMagneticFallback` |
| Inclinación | pitch |
| Red | `isOnline` |
| Reloj | fecha y hora fijas (`2026-10-14T17:28:00-05:00`) |
| Pinger | `SimulatedPinger` con semilla, `delayScale` y entradas fijas; o un transporte de guion que emite líneas exactas |
| Bluetooth | estado (encendido, apagado, sin permiso) y dispositivos escaneados |
| UUID | secuencia fija |
| Animaciones | duración 0 en la captura |

Las capturas nuevas de iOS usan los **mismos valores**, según C-8.

## VA-8 Herramientas

- Android: Maestro (flujos por estado) + `adb exec-out screencap -p`.
- Comparación: Node + `pixelmatch` + `sharp`, con perfiles ICC para la conversión.
- Informe: HTML con referencia, captura, diferencias, métricas (a)–(d) y veredicto por estado.
- `npm run visual` sale con 1 si algún estado no cumple.

## VA-9 Estados obligatorios

Todos los de `ui-spec.md` §3 (61 estados) × el modo de la captura de referencia. Los estados de las hojas y del apuntamiento se capturan en oscuro; el mapa, la guía y la barra, en el modo en que aparecen (forzados a oscuro). Si se decide aceptar también el modo claro, cada estado se duplica en claro, con sus referencias.
