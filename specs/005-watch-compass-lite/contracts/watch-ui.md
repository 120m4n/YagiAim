# Contrato: interfaz del reloj

Pantallas del Series 3: 38 mm = 136 × 170 pt; 42 mm = 156 × 195 pt. El diseño escala con el ancho `w` disponible. Fondo negro (watchOS). Sin desplazamiento: todo entra en una pantalla.

## Pantalla principal (`state = ok`)

```
┌──────────────────────┐
│ pico de la vieja     │  ← name: .footnote, secundario, 1 línea, truncado al final
│        ▼             │  ← marca fija del boom (triángulo), blanca o verde si está alineado
│     ╭──────╮         │
│    │   ╲    │        │  ← anillo + cuña ±max(tol,1)° (18 % de opacidad) + aguja girada Δ
│     ╰──────╯         │     (target, o verde si está alineado); diámetro = 0.62·w
│  ↻ Gira 26°          │  ← .title3 bold, cifras tabulares; target / verde "Alineado"
│  199.7° SSO          │  ← .body, cifras tabulares
│  34.22 km · ±16°     │  ← US3: .footnote; la precisión en target si no es válida
└──────────────────────┘
```

| Elemento | Especificación | Origen en iOS |
|---|---|---|
| Aguja | Misma forma que `Needle` de `CompassView` (punta, base con muesca), ancho 0.07·d, largo 0.42·d, rotación Δ, animación easeOut de 0.15 s por el camino corto | `CompassView.swift` L36–43, L101–111 |
| Marca del boom | `Triangle` de `CompassView`, 0.06·d × 0.05·d, arriba | L45–48 |
| Cuña | `BeamWedge` con `halfAngle = max(tolerance, 1)` | L32–34, L125–137 |
| Anillo | círculo con trazo de 1.5 pt, secundario al 40 % | L68 |
| Centro | círculo de 0.04·d | L50 |
| Instrucción | "Gira %.0f°" + `arrow.clockwise` (Δ > 0) / `arrow.counterclockwise` (Δ < 0); "Alineado" + `checkmark.circle.fill` en verde | `AimView.swift` L105–120 |
| Azimut | `"%.1f° %@"` con `Geo.cardinal` | `AimView.swift` L30 |
| Distancia | `AimInfo.distanceText` | `AimInfo.swift` L24–26 |
| Precisión | `±%.0f°` o "sin calibrar"; target si `!SessionRules.headingIsValid` | `AimView.swift` L101–103 |
| Aviso magnético | "Norte magnético" (`.footnote`, target) en lugar de la línea de distancia | — (versión corta del aviso de `AimView` L49–52) |

## Otros estados

Todos centrados, sin brújula:

| Estado | Contenido |
|---|---|
| `idle` | ícono `scope` (target) + "Abre Apuntar en el iPhone" |
| sin mensajes ≥ 3 s | la última pantalla atenuada al 30 % + banda "Sin datos del iPhone" (target); sin háptica |
| iPhone no alcanzable al abrir | "Sin conexión con el iPhone" |
| `noLocation` | `name` + `ProgressView` + "Obteniendo ubicación…" |
| `noHeading` | `name` + "Brújula no disponible" + azimut y distancia (sí se conocen) |
| versión | "Actualiza la app del reloj" |
| primera vez | "La brújula sigue al iPhone sobre el boom, no a tu muñeca." + botón "Entendido" |

## Íconos

SF Symbols disponibles en watchOS 8: `scope`, `arrow.clockwise`, `arrow.counterclockwise`, `checkmark.circle.fill`.

## Dibujo

`Shape`/`Path` de SwiftUI. Las formas `Needle`, `Triangle` y `BeamWedge` se **extraen** de `CompassView.swift` a `Shared/CompassShapes.swift` sin cambiarlas (son privadas hoy; el iPhone las sigue usando idénticas). No se usa `Canvas` ni `TimelineView`: solo se redibuja cuando llega un estado.
