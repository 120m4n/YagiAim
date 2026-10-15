# Data Model: 005 Brújula lite en Apple Watch

## Compartido (`Shared/WatchPayload.swift`, iOS + watchOS)

```swift
struct WatchAimState: Equatable {
    enum Kind: String { case idle, noLocation, noHeading, ok }
    static let version = 1

    var seq: Int
    var sentAt: Date
    var kind: Kind
    var name: String?          // todos salvo idle
    var bearing: Double?       // noHeading, ok
    var distance: Double?      // noHeading, ok
    var delta: Double?         // ok
    var aligned: Bool?         // ok
    var tolerance: Double?     // ok
    var accuracy: Double?      // noHeading, ok
    var magnetic: Bool?        // noHeading, ok

    func message() -> [String: Any]                       // contrato §1
    static func decode(_ m: [String: Any]) -> Decoded     // .state(Self) | .unsupportedVersion | .invalid
}
```

Reglas puras (también en `Shared/`, con tests en iOS):

- `WatchEmitPolicy.shouldSend(previous:current:lastSentAt:now:) -> Bool` (FR-003).
- `WatchFreshness.isStale(lastReceivedAt:now:) -> Bool` (3 s).
- `WatchOrdering.accept(lastSeq:lastSentAt:incoming:) -> Bool` (contrato §3).

## iPhone (`MeshAzimuth/WatchBridge.swift`)

```swift
@MainActor @Observable
final class WatchBridge: NSObject, WCSessionDelegate {
    func activate()                          // en MeshAzimuthApp.init si WCSession.isSupported()
    func publish(_ state: WatchAimState?)    // nil = idle; aplica WatchEmitPolicy
}
```

`AimView` arma el `WatchAimState` con los valores que ya calcula (FR-002) y lo publica en `onChange` de esos valores. En `onDisappear`, y cuando `scenePhase != .active`, publica `nil` (estado idle).

## Reloj (`MeshAzimuthWatch/`)

```swift
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {   // watchOS 8: sin @Observable
    @Published private(set) var state: WatchAimState?
    @Published private(set) var stale: Bool
    @Published private(set) var reachable: Bool
    @Published private(set) var unsupportedVersion: Bool
    func requestSnapshot()
}
final class WatchHaptics { func startAligned(); func stop() }              // D-4
```

`UserDefaults` del reloj: `watch.intro.done` (`Bool`).
