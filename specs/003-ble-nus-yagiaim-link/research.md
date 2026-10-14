# Research: 003 BLE NUS + YagiAim

## R-1 Pila BLE en el pinger

**Decision**: Adafruit Bluefruit (`bluefruit.h`, `BLEUart`) del framework Adafruit nRF52, usando el fork de MeshCore (`meshcore-dev/Adafruit_nRF52_Arduino#d541301`) con SoftDevice S140 7.3.0.

**Rationale**: `BLEUart` implementa NUS con FIFO, fragmentación por MTU y callbacks de conexión. Es la pila que usa el companion de MeshCore en el mismo hardware. El fork incluye el parche contra bloqueos del stack en reconexiones rápidas (MeshCore PR #1177/#1295), un escenario típico cuando la app reconecta en campo.

**Alternatives considered**: NimBLE-Arduino (no es la pila nativa en nRF52 con SoftDevice); Zephyr/nRF Connect SDK (obligaría a reescribir el cascarón y el build, y rompería el Principio VI).

## R-2 Cadencia controlada por la app (no `GO`)

**Decision**: La app envía un `PING` por muestra y fija `heading_tx` al escribir el comando.

**Rationale**: Con `GO` el pinger decide cuándo transmitir y la app solo se entera por la línea `P,`, entre 0.4 y 1.1 s después. Girando la antena a 10°/s eso son hasta 11° de error. Con `PING` individual, el instante de TX es la escritura + latencia BLE (~15–30 ms) + LBT, y además se mide `heading_rx` para detectar movimiento (`unstable`).

**Alternatives considered**: añadir `t_tx` en `P,` y sincronizar relojes. Requiere sincronización de reloj y cambiar el protocolo. Se descarta por simplicidad.

## R-3 Latencia BLE

Con un intervalo de conexión de 15–30 ms, una escritura sin respuesta llega en ≤ 1 intervalo y una notificación de vuelta en ≤ 1 intervalo, así que la ida y vuelta añade ≤ 60 ms. iOS no garantiza intervalos menores a 15 ms para apps de terceros. SC-002 (≤ 100 ms p95) deja margen.

## R-4 Rumbo en el instante exacto

`LocationManager.heading` ya está suavizado (EMA α = 0.25 sobre sin/cos, unas 4 muestras de constante de tiempo). Para `heading_tx`/`heading_rx` se usa ese mismo valor suavizado, porque el crudo tiene ±1–2° de ruido. El umbral de `unstable` (2°) se calibra con SC-004. Si da falsos positivos con el teléfono quieto, subir a 3°.

## R-5 Media circular

El rumbo medio de una lectura es `atan2(Σ sin h, Σ cos h)`, nunca el promedio aritmético (359° y 1° promedian 0°, no 180°). Ya existe `Geo.normalize`; se añade `Geo.circularMean`.

## R-6 `SimulatedPinger`

Patrón de Yagi aproximado para tests y demo:

```
G(δ) = 10·log10( max( cos(δ/2)^(2n), 10^(−FB/10) ) )    con n = 8, FB = 12 dB
snr_up = snr0 + G(δ) + N(0, 0.75)                        cuantizado a 0.25 dB
```

Con n = 8 el haz de −3 dB queda en ±33.5° (67° total; verificado numéricamente) y la relación F/B en 12 dB, del orden de una Yagi de 3 elementos. Los parámetros se pueden ajustar al patrón de MMANA-GAL. `snr0` por defecto es 0 dB. El RTT se simula con la tabla de 001 R-3 (SF7). La pérdida es del 5 % i.i.d.

## R-7 Persistencia de sesiones

**Decision**: JSON por sesión (`Codable`) en `Application Support/Sessions`. Sin SwiftData ni CoreData (Principio VI). Las sesiones pesan < 100 KB.

## R-8 Fixtures compartidos en iOS

**Decision**: En `ios/project.yml`, recurso de `YagiAimTests` → `../firmware/pinger/test/fixtures/lines` como *folder reference* (`type: folder`). XcodeGen lo soporta con `buildPhase: resources`. El test lo carga con `Bundle(for:).url(forResource: "lines", withExtension: nil)`.
