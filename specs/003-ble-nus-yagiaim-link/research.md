# Research: 003 BLE NUS + MeshAzimuth

## R-1 Pila BLE en el pinger

**Decision**: Adafruit Bluefruit (`bluefruit.h`, `BLEUart`) del framework Adafruit nRF52, usando el fork de MeshCore (`meshcore-dev/Adafruit_nRF52_Arduino#d541301`) con SoftDevice S140 7.3.0.

**Rationale**: `BLEUart` implementa NUS con FIFO, fragmentación por MTU y callbacks de conexión. Es la pila que usa el companion de MeshCore en el mismo hardware. El fork incluye el parche contra bloqueos del stack en reconexiones rápidas (MeshCore PR #1177/#1295), un escenario típico cuando la app reconecta en campo.

**Alternatives considered**: NimBLE-Arduino (no es la pila nativa en nRF52 con SoftDevice); Zephyr/nRF Connect SDK (obligaría a reescribir el cascarón y el build, y rompería el Principio VI).

## R-2 Cadencia controlada por la app (no `GO`)

**Decision**: La app envía un `PING` por muestra y fija `heading_tx` al escribir el comando.

**Rationale**: Con `GO` el pinger decide cuándo transmitir y la app solo se entera por la línea `P,`, ≈ 1.4 s después con el preset por defecto (ToA 177 ms + ventana de recepción de 1207 ms). Girando la antena a 10°/s eso son ≈ 14° de error. Con `PING` individual, el instante de TX es la escritura + latencia BLE (~15–30 ms) + LBT, y además se mide `heading_rx` para detectar movimiento (`unstable`).

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

Con n = 8 el haz de −3 dB queda en ±33.5° (67° total; verificado numéricamente) y la relación F/B en 12 dB, del orden de una Yagi de 3 elementos. Los parámetros se pueden ajustar al patrón de MMANA-GAL. `snr0` por defecto es 0 dB. El RTT se simula con la tabla de 001 R-3 (SF10/BW250, preset por defecto). La pérdida es del 5 % i.i.d. El `SimulatedPinger` debe imitar al firmware real: entrega el `P,` tras ToA + ventana (≈ 1.38 s, con reloj inyectable), responde `!ERR state busy` a un `PING` con otro pendiente y emite `#WARN duty_wait` según el límite del 10 % en 60 s.

## R-7 Persistencia de sesiones

**Decision**: JSON por sesión (`Codable`) en `Application Support/Sessions`. Sin SwiftData ni CoreData (Principio VI). Las sesiones pesan < 100 KB.

## R-8 Fixtures compartidos entre repos

**Decision**: los fixtures de líneas viven en Meshcore (`examples/trace_pinger/tests/fixtures/lines/`) y la app MeshAzimuth no puede referenciarlos de forma portable. Se copian a `MeshAzimuthTests/Fixtures/lines/` (carpeta de recursos del target de tests con XcodeGen) y `tools/sync_fixtures.sh` tiene dos modos: sin argumentos copia desde `$MESHCORE_DIR` (por defecto `/Users/120m4n/GitHub/Meshcore`), y `--check` compara byte a byte y sale ≠ 0 si difieren.

**Rationale**: un submódulo o un paquete compartido añade infraestructura desproporcionada para 5 archivos de texto. La copia más una comprobación explícita conserva la garantía de la Constitución IV (mismos fixtures en ambos lados) y hace visible cualquier deriva. Los tests Swift cargan la carpeta con `Bundle(for:).url(forResource: "lines", withExtension: nil)`.

## R-9 BLE desde el hilo de `loop()`

Verificado: el companion de MeshCore ya usa `BLEUart` de Bluefruit en este hardware (`src/helpers/nrf52/SerialBLEInterface`), y `NRF52Board` es compatible con el SoftDevice. Los callbacks de Bluefruit corren en otra tarea FreeRTOS y `Pinger` no es seguro entre hilos (FR-019). Se usa sondeo (`bleuart.available()`/`read()`) y una bandera `volatile` para la desconexión. El MTU se solicita con `Bluefruit.configPrphConn(...)` antes de `Bluefruit.begin(1, 0)`.

## R-10 Cadencia en vivo y límite de TX del pinger

Con el preset por defecto (ToA 177 ms) el límite de 10 % en 60 s permite ≈ 33 TX por minuto. A `rate = 1500 ms` (40 pings/min) el pinger empezaría a retrasar los TX tras ~50 s con `#WARN duty_wait`, y `heading_tx` dejaría de corresponder al instante real. A 2000 ms son 30 pings/min, 8.8 % de duty: sostenible. Por eso el intervalo en vivo por defecto es 2000 ms y las muestras con `#WARN duty_wait` se marcan `invalid`.
