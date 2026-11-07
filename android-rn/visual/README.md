# Suite de aceptación visual (US6, VA-1…VA-9) — pendiente

`npm run visual` sale con 1 hasta que exista. Lo que falta, y por qué no se pudo hacer en la sesión de implementación:

| Tarea | Falta | Necesita |
|---|---|---|
| T130 | anotar las 12 capturas iOS (cajas por `testID` y valores visibles) en `visual/states/<estado>.json` | revisión manual de las capturas |
| T131 | variante `visualTest` con proveedores falsos (VA-7) y 61 flujos Maestro | SDK de Android + AVD |
| T132 | AVD de referencia 1290×2796 @480 dpi, API 35 con Play Services, `es-CO` (VA-2) | SDK de Android |
| T133 | comparador (pixelmatch + sharp, P3→sRGB, métricas (a)–(f)) | capturas de Android |
| T134 | `npm run visual` en CI con emulador | T131–T133 |
| T135 | línea base de los 50 estados sin captura iOS y aprobación del dueño (`visual/approvals.md`) | el dueño con un iPhone |

Los componentes ya existen en `src/ui/ios/`; los `testID` de los elementos medibles se añaden junto con T131.
