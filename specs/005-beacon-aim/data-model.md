# Data Model: orientar con baliza

Todo nuevo salvo lo marcado como **cambio**. Los cambios son aditivos y opcionales (FR-001, FR-002).

## Enlace (`Link/`)

### `MeasResult` (nuevo, en `LineCodec.swift`)
```swift
struct MeasResult: Equatable {
    var n: Int, kept: Int
    var mean: Double, sd: Double, median: Double, min: Double, max: Double   // dBm / dB
    var clean: Bool { Double(kept) >= 0.8 * Double(n) }
}
```

### `PingerEvent` (**cambio**)
Nuevo caso `.meas(MeasResult)`. Los demás no cambian; `.unknown` sigue siendo el destino de lo que no se entiende.

### `PingerDevice` (**cambio**)
Nuevo `kind: Kind` (`.yagi` para `YagiPinger-`, `.pingPong` para `PingPong-PI-`), deducido del nombre en el escaneo. `proto` y `fw` ya existen.

### `PingerLink` (**cambio**, aditivo)
- `var mode: Mode { proto == 2 ? .beacon : .trace }` (de solo lectura, sale del handshake).
- `func meas(n: Int = 32) async throws -> MeasResult`
- `func setFrequency(_ mhz: String) async throws`
- `startMeter(onReading:)` / `stopMeter()` / `metering: Bool`: el bucle de US2. Exclusivo con `startLive()`.
- `ping()`, `startLive()` y `configure(hash:)` lanzan `PingerError.rejected(code: "mode", …)` con `proto=2`.

## Baliza (`Beacon/`, carpeta nueva)

### `BeaconReading`
```swift
struct BeaconReading: Equatable, Codable {
    var t: Date
    var level: Double          // MeasResult.mean
    var sd: Double
    var n: Int, kept: Int
    var heading: Double?       // loc.heading al recibir la M
    var headingAccuracy: Double
    var pitch: Double?         // motion.pitch
    var valid: Bool            // clean, nivel ≥ piso + 10 y precisión ≤ 15°
}
```

### `BeaconSweep` (`@Observable`, en `BeaconSession.swift`)
Punto del mapa, `freq`, `floor: Double?`, `readings: [BeaconReading]`, `peak: BeaconReading?`, `bisect: BisectResult?` (recalculado con cada lectura válida), `reset()`.

### `BisectResult` (en `BeaconBisect.swift`, función pura)
```swift
enum BisectResult: Equatable {
    case found(center: Double, left: Double, right: Double, beamwidth: Double, peak: Double, peakHeading: Double)
    case needLeft(peak: Double, peakHeading: Double)
    case needRight(peak: Double, peakHeading: Double)
    case notEnough
}
enum BeaconBisect {
    static let binDeg = 2.0
    static func estimate(_ readings: [BeaconReading], drop: Double = 3) -> BisectResult
}
```
Reglas (FR-024):
- solo lecturas `valid` con rumbo;
- celdas de 2° con el máximo de cada una;
- recorrido circular desde la celda del máximo hacia cada lado hasta el primer valor ≤ máximo − 3 dB, con interpolación lineal entre la última celda por encima y la primera por debajo;
- celdas vacías en el camino se saltan; un hueco de > 20° corta ese lado;
- centro = media circular de los dos cruces (`Geo.circularMean`, ya existe).

### `BeaconTone` (US4)
`AVAudioEngine` + `AVAudioSourceNode`; `start()`, `stop()`, `update(relative dB)`.

## Persistencia (**cambio**)

### `Repeater`
Nuevo `var beaconFreq: String?` (`"914.000"`), con `decodeIfPresent`, igual que `hashPrefix`. El JSON antiguo se lee igual.

Los barridos **no** se guardan en `SessionStore`: viven en memoria mientras dura la pantalla y se exportan con US5.

## Simulador (**cambio**)

`SimulatedPinger.Config`: nuevo `beacon: BeaconSim?`. Con `beacon != nil`:
- `HELLO` responde `proto=2` fw 0.5.1 y nombre `PingPong-PI-SIM00001`;
- `MEAS n` responde una `M` con nivel = `txDbm + yagiGain(Δ rumbo con SimInputs.target) − pérdida`, más ruido de 0,5 dB, cuantizado a 0,5 dB y en potencia sobre el piso de −99 dBm;
- `SET freq` se acepta; si no coincide con `beacon.freq`, se mide el piso.

`yagiGain(deltaDeg:n:fbDB:)` ya existe y se reutiliza.
