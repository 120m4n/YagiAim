# Contrato: especificación de interfaz (pixel perfect)

Unidades: **pt de iOS = dp de Android** (en el AVD de referencia, 430×932 dp a 480 dpi equivale al iPhone de las capturas, 430×932 pt @3x).

Inventarios generados del código (no editar a mano; se regeneran con `tools/inventory.py`):
- `inventory/strings.tsv`: 406 literales con texto, con archivo y línea;
- `inventory/symbols.tsv`: 33 símbolos SF con sus usos;
- `inventory/fonts.tsv`: 50 usos de `.font(...)`;
- `inventory/keys.tsv`: claves de persistencia.

**Regla de textos**: todo texto visible del port sale de `strings.tsv` (mismo literal, mismas interpolaciones y formatos FS-01). Un texto que no esté ahí es un defecto.

## 1. Tokens

### 1.1 Tipografía (estilos de texto de iOS en tamaño "Large")

| Estilo SwiftUI | Tamaño / interlineado (pt) | Peso | Usos (ver `fonts.tsv`) |
|---|---|---|---|
| `.largeTitle` | 34 / 41 | regular (`.bold()` → bold) | "Alineado", "Gira N°" |
| `.title` | 28 / 34 | regular (`.bold()`) | títulos de la guía |
| `.title2` | 22 / 28 | regular (`.bold()`) | nombre en *Acerca de*; "Brújula no disponible" |
| `.title3` | 20 / 25 | regular (`.bold()`) | "Azimut …" del panel |
| `.headline` | 17 / 22 | semibold | nombre del repetidor, "Conectado · …" |
| `.body` | 17 / 22 | regular | tablas del apuntamiento y de la tarjeta de enlace |
| `.callout` | 16 / 21 | regular | resumen de lectura, línea 1 de lecturas |
| `.subheadline` | 15 / 20 | regular | distancia del panel, "En vivo", cápsula del mapa |
| `.footnote` | 13 / 18 | regular | avisos, botones pequeños, tolerancia |
| `.caption` | 12 / 16 | regular | detalles, títulos de métricas |
| `.caption2` | 11 / 13 | regular | atribución OSM |
| `.system(size: s·0.07, .bold, .rounded)` | proporcional a la brújula | bold, redondeada | N/E/S/O |
| `.system(size: s·0.035, .monospaced)` | proporcional | regular, monoespaciada | 30…330 |
| `.system(size: 18, .semibold)` | 18 | semibold | ícono del botón de seguimiento |
| `.system(size: 64/44, .semibold)` | 64 / 44 | semibold | íconos de la guía y de *Acerca de* |

- Familias (PM-26): **Inter** para todo el texto; N/E/S/O de la brújula como trazos propios redondeados; **JetBrains Mono** para 30…330.
- `monospacedDigit()` → `fontVariant: ['tabular-nums']` (Inter tiene `tnum`).
- **Tracking**: SF aplica un tracking dependiente del tamaño (tabla "Tracking" de Apple HIG → Typography). El port aplica a cada tamaño el valor de esa tabla, convertido a `letterSpacing` y **ajustado** para Inter hasta que las cajas de texto cumplan VA-6 (c) en las capturas 02, 05_01 y 09 (calibración T060).

### 1.2 Colores

**Marca** (`Theme.swift`, sRGB): `navy #011949`, `accent #2E8CFF`, `target #FF9E1A`. Verificados en las capturas tras convertir de Display P3 a sRGB: botón "Medir aquí" `#2D8CFF`, barra del mapa `#001949`.

**Sistema** (modo oscuro, medidos en las capturas en sRGB; para el modo claro no hay capturas, así que se usan los valores de la paleta de colores de sistema que publica Apple):

| Token | Uso | Oscuro (medido) | Claro |
|---|---|---|---|
| `systemBackground` | fondo del apuntamiento | `#000000` | medir |
| fondo de hoja (`systemGroupedBackground` elevado) | hojas | `#1C1C1E` | medir |
| celda de lista / campo de formulario | filas | `#2C2C2E` | medir |
| separador de celdas | entre filas | `#404043` (opaco sobre la celda) | medir |
| `.thinMaterial` sobre negro | tarjeta de enlace | `#1E1E1E` (sólido, PM-27) | medir |
| `.bordered` + accent | "Calibrar boom" | fondo `#0C2340`, texto accent | medir |
| pista del deslizador | tolerancia | `#191919` | medir |
| relleno del deslizador | tolerancia | accent | accent |
| pista del interruptor apagado | "En vivo" | `#616161` | medir |
| panel inferior del mapa | `navy` al 94 % sobre el mapa | `#071F49` (sobre el satélite) | igual (forzado oscuro) |
| `label` / `.primary` | texto | — | — |
| `secondaryLabel` / `.secondary` | textos secundarios | — | — |
| `.green` / `.red` | alineado, conectado / errores | systemGreen / systemRed | — |

Los tokens oscuros que no tienen muestra directa (por ejemplo `label`, `secondaryLabel`, `systemGreen`, `systemRed`) se toman de la paleta de sistema de Apple y se **verifican** midiendo los textos de las capturas existentes (T053). Si no coinciden, manda la captura. Las celdas "medir" de la columna clara toman el valor publicado por Apple.

### 1.3 Geometría recurrente

| Elemento | Medida | Origen |
|---|---|---|
| Panel inferior | radio 18, borde accent al 50 % de 1 pt, padding estándar (16), espacio 14, brújula de 84×84 | `ContentView.swift` L111–131 |
| Cápsula sin repetidor | padding 12, cápsula, borde accent al 50 %, abajo 8 | L136–142 |
| Botón de seguimiento | 44×44, radio 10, navy al 94 %, borde accent (al 35 % y 1 pt sin seguir; al 90 % y 1.5 pt siguiendo), 8 arriba / 12 a la derecha | `TrackingButton.swift` |
| Atribución OSM | `.caption2`, padding 4, `.regularMaterial`, radio 4, margen 6 | `ContentView.swift` L49–57 |
| Banner de ubicación | radio 14, borde target al 70 %, padding 10, navy al 94 % | `PermissionBanner.swift` |
| Tarjeta de enlace | padding 14, radio 14, `.thinMaterial`, márgenes horizontales 16, espaciado 10 | `LinkCard.swift` L24–27 |
| Sparkline | alto 56, accent, eje X oculto | `LinkCard.swift` L85–88 |
| Celdas, hojas, cápsulas de la barra | geometría de iOS 26 medida en las capturas (radio de celda ≈ 26 pt, radio superior de la hoja, cápsulas de la barra de 44 pt de alto) | capturas 02, 04, 09 |

## 2. Componentes iOS a reproducir (FR-060)

Cada uno con su estado en `visual-acceptance.md`:

| Componente | Variantes en la app | Notas |
|---|---|---|
| Barra de navegación en línea | título centrado; elementos en cápsulas de vidrio (iOS 26): agrupados a la derecha (info + lista) y solos a la izquierda; botones de texto en cápsula ("Listo", "Cancelar", "Guardar") | barra del mapa con fondo navy visible y esquema oscuro |
| Hoja (`.sheet`) | editor, lista, acerca de, selector, sesión | esquinas superiores redondeadas, fondo `#1C1C1E` en oscuro; el contenido de abajo se oscurece |
| Pantalla completa | apuntamiento, guía | sin barra de hoja |
| Lista agrupada (`List`/`Form`) | todas las hojas | encabezados de sección en gris, celdas redondeadas, separadores con sangría, pies `.footnote` en gris |
| Fila de navegación | sesiones | chevron gris a la derecha |
| `Toggle` | "En vivo", "Pinger simulado" | estilo iOS 26 (pista ancha, perilla en cápsula); "encendido" = accent (por `.tint`) |
| `Slider` | tolerancia | perilla en cápsula de vidrio (iOS 26), relleno accent |
| `.borderedProminent` | "Conectar pinger", "Medir aquí", "Abrir Ajustes" (pequeño), "Siguiente/Empezar" (grande) | cápsula rellena de accent, texto blanco; deshabilitado según iOS |
| `.bordered` | "Calibrar boom", "Restablecer", "Reintentar", "Abrir Ajustes" de la tarjeta | cápsula con relleno tintado (medido) |
| Botón de texto destructivo | "Desconectar", "Borrar caché de mapas" | systemRed |
| `confirmationDialog` | calibrar, borrar caché | hoja de acciones inferior con título visible y "Cancelar" implícito |
| `alert` | "Importación" | alerta centrada con "OK" |
| `Menu` + `Picker` | "…" de la lista | menú anclado con check en la opción elegida, separador e ítems con ícono |
| Acciones por deslizamiento | borrar (fin, deslizamiento completo, rojo), editar (inicio, accent) | — |
| `searchable` | lista | barra de búsqueda con el texto indicativo "Buscar repetidor" |
| `ContentUnavailableView` | lista vacía | ícono grande, título, descripción |
| `ProgressView` | conectando, buscando, obteniendo ubicación | indicador de actividad de iOS (no el circular de Material) |
| `TabView(.page)` | guía | paginación horizontal con puntos |
| `Label` | casi todos los textos con ícono | separación ícono–texto de iOS |
| `Grid` | tabla del apuntamiento (24/8), métricas (20/4) | alineación por columnas |
| `contentTransition(.numericText())` | "Gira N°" | transición de dígitos |

## 3. Pantallas

En cada pantalla los textos son los de `strings.tsv` para el archivo indicado; aquí solo se describen la estructura, los estados y las reglas.

### 3.1 Mapa (`ContentView.swift`, `MapView.swift`, `TrackingButton.swift`)

- Barra: izquierda, `map` (si es satélite) o `globe.americas` (si es estándar); derecha, `info.circle` y `list.bullet`. Título "MeshAzimuth".
- Capas, de abajo hacia arriba: mapa (debajo del área segura inferior) → línea de apuntamiento → marcadores → escala (8, 8) → botón de seguimiento (arriba derecha) → brújula del mapa (60 bajo el área segura, 12 a la derecha) → atribución OSM (solo estándar) → banners (arriba, separados 8) → panel o cápsula (inserto inferior).
- Panel: brújula pequeña sin interacción; nombre; "Azimut %.1f° %@" (`.title3`, tabular, negrita); distancia en accent con el sufijo " · ubicación anterior"; o "Esperando GPS…"; chevron. Forzado oscuro.
- Estados para la suite visual: `map-empty`, `map-selected-satellite`, `map-selected-standard`, `map-cached-location`, `map-offline`, `map-location-denied`, `map-tracking-follow`, `map-tracking-heading`.

### 3.2 Guía (`OnboardingView.swift`)

- 3 páginas con íconos `mappin.and.ellipse`, `iphone.gen3` y `scope`; botón "Siguiente" (páginas 1–2) o "Empezar" (página 3); fondo navy; oscuro.
- Estados: `onboarding-1`, `onboarding-2`, `onboarding-3`.

### 3.3 Lista de repetidores (`RepeaterViews.swift` `RepeaterList`)

- Barra: izquierda, `plus` y `ellipsis.circle`; derecha, "Cerrar"; título "Repetidores"; búsqueda.
- Fila: nombre + detalle; check `checkmark` en target en la seleccionada.
- Estados: `list-empty`, `list-by-distance`, `list-by-name`, `list-search`, `list-menu`, `list-swipe-delete`, `list-swipe-edit`, `list-import-alert`.

### 3.4 Editor (`RepeaterEditor`)

- Secciones: "Nombre", "Coordenadas (WGS84)", "Opcional" (+ pie), "Pinger LoRa (opcional)" (+ pie y error en rojo).
- Barra: "Cancelar", título "Nuevo repetidor"/"Editar", "Guardar" (deshabilitado según la regla).
- Estados: `editor-new-from-map`, `editor-new-from-plus` (lat/lon `0.0`, FS-09), `editor-edit` (= captura 02), `editor-hash-invalid`.

### 3.5 Acerca de (`AboutView.swift`)

- Estados: `about`, `about-clear-confirm`.

### 3.6 Apuntamiento (`AimView.swift`, `CompassView.swift`, `PingerSection.swift`, `LinkCard.swift`)

- Orden vertical (espaciado 20, padding superior estándar, todo dentro de un `ScrollView`):
  1. brújula a lo ancho con márgenes de 24;
  2. instrucción;
  3. tabla;
  4. aviso de norte magnético;
  5. tolerancia;
  6. calibración;
  7. sección del pinger;
  8. texto final.
- Barra: título = nombre del repetidor; "Listo" a la derecha. En la captura 05 el contenido se desplaza por debajo de la barra (barra transparente con efecto de borde de iOS 26).
- Brújula: según FR-027; tamaño = ancho disponible.
- Estados:
  - brújula aislada (equivale al `#Preview`, rumbo 40°, objetivo 72°): `compass-preview`;
  - apuntamiento: `aim-no-location`, `aim-turn-right`, `aim-turn-left`, `aim-aligned`, `aim-with-elevation-up`, `aim-with-elevation-down`, `aim-magnetic-fallback`, `aim-calibrated-offset`, `aim-calibrate-confirm`, `aim-heading-uncalibrated`;
  - enlace: `link-disconnected`, `link-connecting`, `link-failed-bt-off`, `link-failed-unauthorized`, `link-failed-incompatible`, `link-connected-empty` (= captura 05_01), `link-live` (= 05_02/05_03), `link-timeout-status`, `link-warning-duty`, `link-warning-collision`;
  - medición: `aim-no-hash-hint`, `measure-progress` (= captura 07), `measure-reading` (= captura 08), `measure-reading-repeat`, `measure-error`.

### 3.7 Selector de pinger (`PingerPicker.swift`)

- Estados: `picker-searching`, `picker-found` (= captura 04), `picker-timeout`, `picker-bt-off`, `picker-unauthorized`, `picker-simulated-row`.

### 3.8 Sesiones (`SessionView.swift`)

- Estados: `sessions-empty`, `sessions-current` (= captura 09), `sessions-with-past`, `session-detail` (= captura 10 antes de compartir), `session-detail-repeat-mark`.

## 4. Animaciones

| Animación | Origen | Especificación |
|---|---|---|
| Rotación del dial y de la aguja | `CompassView.swift` L28–29, L41–42 | easeOut de 0.15 s sobre el valor numérico, **incluida la vuelta larga al cruzar el norte** (C-7: se traspasa el comportamiento de iOS) |
| Cambio de página de la guía | `OnboardingView.swift` L37 | `withAnimation` por defecto (spring de SwiftUI) al pulsar "Siguiente"; arrastre libre entre páginas |
| Borrado de fila | `RepeaterViews.swift` L59 | `withAnimation` por defecto |
| Transición numérica | `AimView.swift` L115 | `.numericText()` |
| Presentación de hojas y pantallas completas | sistema | curvas y duraciones medidas en grabaciones de iOS (research R-6) |
