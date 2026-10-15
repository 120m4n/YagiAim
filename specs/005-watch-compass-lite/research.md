# Research: 005 Brújula lite en Apple Watch Series 3

## R-1 ¿Puede el Series 3 medir el rumbo?

**Hallazgo**: no. La app Brújula y el magnetómetro del Apple Watch aparecen en el Series 5; en los modelos anteriores `CLLocationManager.headingAvailable()` es `false`.

**Decision**: el reloj es una pantalla remota de la brújula del iPhone (el sensor real va sobre el boom). Esto también es lo correcto para el caso de uso: la referencia es el boom, no la muñeca.

## R-2 watchOS y herramientas

| Dato | Valor | Consecuencia |
|---|---|---|
| watchOS máximo del Series 3 | 8.8.1 | `WATCHOS_DEPLOYMENT_TARGET = 8.0` |
| Xcode 26 | destinos watchOS 8–26 y depuración en watchOS 8 o posterior | se compila con el Xcode actual |
| APIs no disponibles en watchOS 8 | Observation (`@Observable`, 10), Swift Charts (9), `.sensoryFeedback` (10), `.contentTransition(.numericText())` (10), `NavigationStack` (9) | el reloj usa `ObservableObject`/`@Published`, háptica con `WKInterfaceDevice` y vistas planas |
| Compatibilidad del emparejamiento | Series 3 con iPhone 6s o posterior e iOS 11 o posterior (incluye 18 y 26) | funciona con el iPhone del usuario |

**Riesgo**: Xcode puede retirar watchOS 8 en una versión futura. Se fija la versión de Xcode usada en `plan.md` y en el CI.

## R-3 Transporte

**Decision**: `WCSession.sendMessage` para el tiempo real, `updateApplicationContext` para el último estado al abrir y una petición de `snapshot` al activarse.

**Rationale**: `sendMessage` es la única vía con latencia interactiva cuando ambas apps están activas. El contexto de aplicación garantiza un estado inicial sin esperar.

**Alternatives considered**:
- `transferUserInfo`: es una cola entregada en orden, no tiempo real, y acumula estados viejos.
- Que el reloj se conecte directo al pinger o al iPhone por BLE: complejidad sin beneficio, y watchOS 8 limita el BLE en segundo plano.

## R-4 Mantener la app visible

El Series 3 no tiene pantalla siempre activa: al bajar la muñeca la app pasa a inactiva y deja de recibir mensajes. `WKExtendedRuntimeSession` solo admite tipos concretos (mindfulness, terapia física, alarma inteligente, cuidado personal) y ninguno corresponde; usarlo para esto sería motivo de rechazo en la revisión. Las sesiones de entrenamiento (`HKWorkoutSession`) tampoco aplican.

**Decision**: solo en primer plano (D-5). Al levantar la muñeca, `snapshot` restaura en ≤ 1 s. En el quickstart se indica configurar en el reloj que vuelva a la última app y no a la esfera (ajuste "Volver al reloj" de watchOS).

## R-5 Háptica

`WKInterfaceDevice.play(_:)` con `WKHapticType`. El iPhone usa un patrón continuo de 3 s con golpes cada 0.5 s (`Haptics.swift`); el reloj no tiene un modo continuo y lo más parecido es `.success` seguido de `.click` cada 0.5 s hasta 3 s (D-4). Se cancela con un token, igual que `Haptics.stop()`.

## R-6 Rendimiento en el Series 3

Procesador S3 de doble núcleo, sin GPU de sobra. **Decision**: vista sin `Canvas` ni `TimelineView`, redibujo solo al llegar un estado (≤ 5/s), una animación de 0.15 s por estado y formas de `Path` sencillas. Se verifica con Instruments (SC-005).

## R-7 Organización del proyecto (XcodeGen)

**Decision**: nuevo target `MeshAzimuthWatch` (`type: application`, `platform: watchOS`, `deploymentTarget: "8.0"`), incluido en `MeshAzimuth` como contenido del reloj. Carpeta `Shared/` con `Geo.swift`, `WatchPayload.swift` y `CompassShapes.swift`, en ambos targets. `Geo.swift` se **mueve** sin cambios a `Shared/` (sigue en el target iOS). La sintaxis exacta de XcodeGen para incrustar la app del reloj se valida en T001 contra la versión de XcodeGen en uso.
