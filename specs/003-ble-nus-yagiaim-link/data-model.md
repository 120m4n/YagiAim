# Data Model: 003 BLE NUS + MeshAzimuth

## Firmware

### Transportes (`examples/trace_pinger/`)

```cpp
enum class Origin : uint8_t { Serial, Ble };
struct CompositeSink : tracecore::LineSink {   // difunde a Serial y BLE
  void line(const char* s, size_t n) override;  // interfaz real de LineSink
};
```

`tracecore::Pinger` recibe `onCommand(line, now, origin = Origin::Serial)` (el valor por defecto mantiene intactos los tests actuales). El origen solo se guarda para FR-005: `onTransportLost(Origin::Ble)` ejecuta `STOP` si `activeOrigin == Ble`. Hay que extender `Pinger`: es un cambio pequeño en `tracecore` y lleva test. Al ejecutar el `STOP` emite `#WARN ble_lost_stop`.

**Hilos**: los callbacks de Bluefruit corren en otra tarea FreeRTOS y `Pinger` no es seguro entre hilos. `BleTransport` lee `bleuart` y escribe las notificaciones desde `loop()`; el callback de desconexión solo pone una bandera `volatile` que `loop()` convierte en `onTransportLost(Origin::Ble)`. El reensamblado por `\n` vive en un `LineAssembler` puro de `tracecore` (con test), compartido por Serial y BLE.

## iOS (`MeshAzimuth/Link/`, `MeshAzimuth/Session/`)

### Repeater (modificado)

```swift
struct Repeater: Identifiable, Codable, Hashable {
  …
  var hashPrefix: String?   // "A1"; validado ^[0-9A-F]{2}$; un opcional sintetizado ya decodifica con decodeIfPresent
}
```

### Protocolo de líneas

```swift
enum PingerEvent: Equatable {
  case hello(fw: String, proto: Int, radio: String, id: String)
  case cfg([String: String])
  case ok(String)
  case warn(code: String, detail: String?)
  case error(code: String, detail: String?)
  case ping(PingResult)
  case summary(BurstSummary)
  case raw(RawFrame)
  case unknown(String)
}
struct BurstSummary: Equatable {           // línea S,  (8 campos: el último es busy)
  var n: Int; var ok: Int; var lossPct: Int?
  var medSnrUp: Double?; var medSnrDn: Double?; var medRssiDn: Double?; var busy: Int
}
struct PingResult: Equatable, Codable {
  var seq: UInt32; var tag: String; var status: Status
  var rttMs: UInt32?; var snrUp: Double?; var snrDn: Double?; var rssiDn: Double?; var nResp: UInt8
  enum Status: String, Codable { case ok, timeout, busy, txerr }
}
```

### Transporte

```swift
protocol LineTransport: AnyObject {
  var state: LinkState { get }                // .idle .scanning .connecting .ready .failed(LinkError)
  var states: AsyncStream<LinkState> { get }  // cada transición, en orden; termina en close()
  var lines: AsyncStream<String> { get }      // líneas completas, sin \n
  func open() async throws                    // conecta hasta .ready o lanza LinkError
  func close()
  func send(_ line: String) async throws      // añade \n y fragmenta; LinkError si no está .ready
}
enum LinkError: Error, Equatable {            // .bluetoothOff .unauthorized .deviceNotFound .connectionLost
  case incompatibleFirmware(proto: Int)       // .timeout .writeFailed; `message` y `opensSettings` para la UI
}
final class BLELineTransport: LineTransport   // CoreBluetooth
final class SimulatedPinger: LineTransport    // R-6
```

### PingerLink (`@Observable`)

| Propiedad | Tipo |
|---|---|
| state | LinkState |
| device | PingerDevice? |
| config | [String: String] (último `#CFG`) |
| last | PingResult? |
| history | RingBuffer<PingResult>(30) |
| live | Bool |

Métodos: `connect(device:hash:)`, `disconnect()`, `configure(hash:)`, `ping() async throws -> PingReport`, `startLive()`, `stopLive()`. `PingReport` = `PingResult` + `tTx`, `tRx` (instantes para `heading_tx`/`heading_rx`) y `dutyWait`. Una sola petición en vuelo: otra lanza `PingerError.requestInFlight`.

- **Handshake** al conectar: `HELLO` → validar `proto=1` → `STOP` → `MON off` → `CFG?` (lee `rate`, `txp`) → `SET hash=XX`.
- **`ping()`** envía `PING` y se resuelve con la primera de: la línea `P,` (única en vuelo, no hace falta correlacionar por `seq`), un `!ERR` (lanza el error) o un timeout local (timeout auto del pinger + 3 s). Registra si llegó un `#WARN duty_wait` en medio.
- **`startLive()`** corre un `Task` con intervalo `max(rate, 2000 ms)` que espera cada resultado antes del siguiente `PING`.

### Sesión

```swift
struct Sample: Codable, Identifiable {
  var id: UUID; var readingIndex: Int
  var tTx: Date; var tRx: Date
  var headingTx: Double; var headingRx: Double; var headingAccuracy: Double
  var latitude, longitude: Double; var altitude: Double?; var hAccuracy: Double
  var targetBearing: Double; var delta: Double
  var unstable: Bool
  var invalid: Bool      // llegó #WARN duty_wait entre el PING y su P,
  var result: PingResult
}
struct Reading: Codable, Identifiable {
  var id: UUID; var index: Int; var meanHeading: Double?; var meanDelta: Double?   // nil sin muestras usables; la media de delta es circular (correcta cerca de ±180°)
  var medSnrUp, medSnrDn, medRssiDn: Double?; var lossPct: Int?   // timeouts/(ok+timeouts); nil sin datos
  var stableCount: Int; var needsRepeat: Bool    // stableCount < 3
}
struct Session: Codable, Identifiable {
  var id: UUID; var repeater: Repeater; var started: Date
  var txpDbm: Int?; var fw: String?; var proto: Int
  var readings: [Reading]; var samples: [Sample]
}
```

Reglas:
- `delta = Geo.signedDelta(target: targetBearing, current: headingTx)`. Mismo signo que la UI: positivo significa girar a la derecha.
- `unstable = abs(Geo.signedDelta(target: headingRx, current: headingTx)) > threshold` (por defecto 2°). `headingRx` se toma al recibir el `P,` (≈ 1.4 s después del TX), así que `unstable` mide el movimiento en toda esa ventana.
- `invalid = true` si hubo `#WARN duty_wait` entre el `PING` y su `P,`. `stableCount` cuenta las muestras `ok`, no `unstable` y no `invalid`.
- Las medianas de `Reading` usan la misma regla que `S,` (n par → promedio de los centrales) para tener paridad con el C++.
