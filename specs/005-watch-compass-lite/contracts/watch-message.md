# Contrato: mensajes iPhone ↔ reloj (WatchConnectivity), `v = 1`

Transporte: `WCSession`. Todos los mensajes son diccionarios `[String: Any]` con tipos *property list* (`Int`, `Double`, `Bool`, `String`). Se codifican y decodifican **solo** en `Shared/WatchPayload.swift`, que se compila en los dos targets.

## 1. Estado de apuntamiento (iPhone → reloj)

Se envía por `sendMessage(_:replyHandler: nil)` cuando el reloj está alcanzable y, como último estado conocido, por `updateApplicationContext(_:)`.

| Clave | Tipo | Presente en | Significado | Origen en la app iOS |
|---|---|---|---|---|
| `type` | `String` | siempre | `"aim"` | — |
| `v` | `Int` | siempre | versión del protocolo (`1`) | — |
| `seq` | `Int` | siempre | contador creciente desde que arrancó `WatchBridge` | — |
| `t` | `Double` | siempre | `Date().timeIntervalSince1970` al enviar | — |
| `state` | `String` | siempre | `idle` \| `noLocation` \| `noHeading` \| `ok` | `AimView` visible y activa; `AimInfo == nil`; `loc.heading == nil` |
| `name` | `String` | todos salvo `idle` | nombre del repetidor | `store.selected.name` |
| `bearing` | `Double` | `noHeading`, `ok` | azimut verdadero (°) | `AimInfo.bearing` |
| `distance` | `Double` | `noHeading`, `ok` | metros | `AimInfo.distance` |
| `delta` | `Double` | `ok` | Δ en (−180, 180]; positivo = girar a la derecha | `AimInfo.delta` |
| `aligned` | `Bool` | `ok` | estado de `CompassView` (con histéresis) | `AimView.aligned` (vía `onAlignedChange`) |
| `tolerance` | `Double` | `ok` | tolerancia (°) | `@AppStorage("tolerance")` |
| `accuracy` | `Double` | `noHeading`, `ok` | precisión de la brújula (°; < 0 = sin calibrar) | `loc.headingAccuracy` |
| `magnetic` | `Bool` | `noHeading`, `ok` | usa el norte magnético | `loc.usingMagneticFallback` |

Orden de evaluación del estado (el mismo que la pantalla del iPhone, `AimView.swift` L20–52):
1. `AimView` no visible o la app no activa → `idle`.
2. Sin `AimInfo` → `noLocation`.
3. Sin `loc.heading` → `noHeading`.
4. En otro caso → `ok`.

## 2. Petición de instantánea (reloj → iPhone)

`sendMessage(["type": "snapshot", "v": 1], replyHandler:)`. El iPhone responde con un estado completo (§1) que se calcula en ese momento; puede ser `idle`.

## 3. Reglas

- **Ritmo de emisión** (iPhone): envía cuando cambia algo visible (FR-003), con un máximo de 5/s, más un latido cada 1 s. Contexto de aplicación como mucho cada 1 s.
- **Orden** (reloj): descarta los estados con `seq` ≤ al último mostrado, salvo cuando el iPhone reinicia (un `seq` menor con un `t` más reciente que el último), caso en que se acepta y se reinicia el contador.
- **Antigüedad** (reloj): si pasan 3 s sin un estado nuevo, los datos se consideran viejos.
- **Versión**: el reloj con `v` > 1 muestra "Actualiza la app del reloj"; el iPhone ignora los mensajes con un `type` desconocido.
- **Tamaño**: < 300 bytes por mensaje (muy por debajo del límite de WatchConnectivity).

## 4. Tests de contrato (`WatchPayloadTests`, en el target de tests iOS)

- Ida y vuelta para los 4 estados, con los campos obligatorios y opcionales.
- Decodificar con claves faltantes o de otro tipo → `nil` (el reloj no muestra nada parcial).
- `v = 2` → decodifica como "versión no soportada".
- Reglas de orden de `seq` y de antigüedad con relojes falsos.
- Regla de emisión (FR-003) con una secuencia de estados: qué se envía y qué no.
