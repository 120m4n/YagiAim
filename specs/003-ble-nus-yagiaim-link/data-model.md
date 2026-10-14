# Data Model: 003 BLE NUS + YagiAim

## Firmware

### Transportes (`firmware/pinger/src/`)

```cpp
enum class Origin : uint8_t { Serial, Ble };
struct CompositeSink : tracecore::LineSink {   // difunde a Serial y BLE
  void write(std::string_view line) override;
};
```

`tracecore::Pinger` recibe `onCommand(line, now, origin)`. El origen solo se guarda para FR-005: `onTransportLost(Origin::Ble)` ejecuta `STOP` si `activeOrigin == Ble`. Hay que extender `Pinger`: es un cambio pequeño en `tracecore` y lleva test.

## iOS (`ios/YagiAim/Link/`, `ios/YagiAim/Session/`)

### Repeater (modificado)

```swift
struct Repeater: Identifiable, Codable, Hashable {
  …
  var hashPrefix: String?   // "A1"; validado ^[0-9A-F]{2}$; decodeIfPresent
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
struct PingResult: Equatable, Codable {
  var seq: UInt32; var tag: String; var status: Status
  var rttMs: UInt32?; var snrUp: Double?; var snrDn: Double?; var rssiDn: Double?; var nResp: UInt8
  enum Status: String, Codable { case ok, timeout, busy, txerr }
}
```

### Transporte

```swift
protocol LineTransport: AnyObject {
  var lines: AsyncStream<String> { get }   // líneas completas, sin \n
  func send(_ line: String) async throws   // añade \n y fragmenta
  var state: LinkState { get }             // .idle .scanning .connecting .ready .failed(Error)
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

Métodos: `connect(to:)`, `disconnect()`, `configure(hash:)`, `ping() async -> PingResult` (correlaciona por `seq` siguiente), `startLive()`, `stopLive()`.

### Sesión

```swift
struct Sample: Codable, Identifiable {
  var id: UUID; var readingIndex: Int
  var tTx: Date; var tRx: Date
  var headingTx: Double; var headingRx: Double; var headingAccuracy: Double
  var latitude, longitude: Double; var altitude: Double?; var hAccuracy: Double
  var targetBearing: Double; var delta: Double
  var unstable: Bool
  var result: PingResult
}
struct Reading: Codable, Identifiable {
  var id: UUID; var index: Int; var meanHeading: Double; var meanDelta: Double
  var medSnrUp, medSnrDn, medRssiDn: Double?; var lossPct: Int
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
- `unstable = abs(Geo.signedDelta(target: headingRx, current: headingTx)) > threshold` (por defecto 2°).
- Las medianas de `Reading` usan la misma regla que `S,` (n par → promedio de los centrales) para tener paridad con el C++.
