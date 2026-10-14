import CoreBluetooth
import Foundation

/// Transporte BLE sobre el Nordic UART Service del pinger (contracts/ble-nus-gatt.md).
///
/// Todo el estado de CoreBluetooth vive en una cola propia (`queue`); desde fuera solo se usan
/// `open`, `close`, `send`, `startScan`/`stopScan` y los `AsyncStream`.
final class BLELineTransport: NSObject, LineTransport, @unchecked Sendable {
    static let serviceUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    static let rxUUID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")   // central → pinger (comandos)
    static let txUUID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")   // pinger → central (eventos)
    static let namePrefix = "YagiPinger-"
    static let lastDeviceKey = "pinger.lastDevice"

    /// Segundos para conectar de punta a punta (SC-001: ≤ 5 s con el pinger a menos de 3 m).
    static let openTimeout = 10.0

    private(set) var state: LinkState {
        get { lock.withLock { _state } }
        set { lock.withLock { _state = newValue }; stateContinuation.yield(newValue) }
    }
    let lines: AsyncStream<String>
    let states: AsyncStream<LinkState>
    /// Pingers vistos durante el escaneo, ordenados por nombre.
    let devices: AsyncStream<[PingerDevice]>

    private let lock = NSLock()
    private var _state: LinkState = .idle
    private let lineContinuation: AsyncStream<String>.Continuation
    private let stateContinuation: AsyncStream<LinkState>.Continuation
    private let deviceContinuation: AsyncStream<[PingerDevice]>.Continuation

    private let queue = DispatchQueue(label: "co.electrosoftware.meshazimuth.ble")
    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var rx: CBCharacteristic?
    private var tx: CBCharacteristic?
    private var assembler = LineAssembler()
    private var targetID: UUID?
    private var found: [UUID: PingerDevice] = [:]
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var scanning = false
    private var wantsOpen = false
    private var openContinuation: CheckedContinuation<Void, Error>?
    private var openTimer: DispatchWorkItem?
    private var outbox: [Data] = []

    /// `deviceID`: periférico concreto (el último usado, por ejemplo). Sin él, conecta al primer `YagiPinger-*`.
    init(deviceID: UUID? = BLELineTransport.lastDeviceID) {
        (lines, lineContinuation) = AsyncStream.makeStream(of: String.self)
        (states, stateContinuation) = AsyncStream.makeStream(of: LinkState.self)
        (devices, deviceContinuation) = AsyncStream.makeStream(of: [PingerDevice].self)
        targetID = deviceID
        super.init()
    }

    static var lastDeviceID: UUID? {
        UserDefaults.standard.string(forKey: lastDeviceKey).flatMap(UUID.init(uuidString:))
    }

    // MARK: - API

    /// Empieza a listar pingers cercanos (para el selector). Crea el gestor de Bluetooth si hace falta.
    func startScan() {
        queue.async {
            self.scanning = true
            if !self.wantsOpen { self.state = .scanning }
            self.ensureCentral()
            self.scanIfPossible()
            self.reportBluetoothAvailability()
        }
    }

    func stopScan() {
        queue.async {
            self.scanning = false
            if !self.wantsOpen { self.central?.stopScan() }
        }
    }

    func select(_ id: UUID?) { queue.async { self.targetID = id } }

    func open() async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            queue.async {
                guard self.openContinuation == nil else { return cont.resume(throwing: LinkError.connectionLost) }
                self.openContinuation = cont
                self.wantsOpen = true
                self.state = .connecting
                self.armOpenTimer()
                self.ensureCentral()
                self.beginConnectIfPossible()
            }
        }
    }

    func close() {
        queue.async {
            self.wantsOpen = false
            self.openTimer?.cancel()
            self.central?.stopScan()
            if let p = self.peripheral { self.central?.cancelPeripheralConnection(p) }
            self.finishOpen(.failure(LinkError.connectionLost))
            self.peripheral = nil; self.rx = nil; self.tx = nil
            self.state = .idle
            self.lineContinuation.finish()
            self.stateContinuation.finish()
            self.deviceContinuation.finish()
        }
    }

    func send(_ line: String) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            queue.async {
                guard self.state == .ready, let p = self.peripheral, self.rx != nil else {
                    return cont.resume(throwing: LinkError.connectionLost)
                }
                // Fragmenta según el MTU negociado; el pinger reensambla por '\n'.
                let size = max(p.maximumWriteValueLength(for: .withoutResponse), 20)
                let bytes = Array((line + "\n").utf8)
                for start in stride(from: 0, to: bytes.count, by: size) {
                    self.outbox.append(Data(bytes[start..<min(start + size, bytes.count)]))
                }
                self.flush()
                cont.resume()
            }
        }
    }

    // MARK: - Gestor (siempre en `queue`)

    private func ensureCentral() {
        if central == nil { central = CBCentralManager(delegate: self, queue: queue) }
    }

    private func armOpenTimer() {
        openTimer?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.openContinuation != nil else { return }
            self.failOpen(self.found.isEmpty && self.peripheral == nil ? .deviceNotFound : .timeout)
        }
        openTimer = item
        queue.asyncAfter(deadline: .now() + Self.openTimeout, execute: item)
    }

    /// Mientras solo se escanea (selector), el estado dice si Bluetooth está apagado o sin permiso.
    private func reportBluetoothAvailability() {
        guard scanning, !wantsOpen, let c = central else { return }
        switch c.state {
        case .poweredOn: state = .scanning
        case .poweredOff, .unsupported: state = .failed(.bluetoothOff)
        case .unauthorized: state = .failed(.unauthorized)
        default: break
        }
    }

    private func scanIfPossible() {
        guard let c = central, c.state == .poweredOn else { return }
        c.scanForPeripherals(withServices: [Self.serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    private func beginConnectIfPossible() {
        guard wantsOpen, let c = central else { return }
        switch c.state {
        case .poweredOn:
            if let p = peripheral {
                connect(p)           // reapertura tras una desconexión: mismo periférico
            } else if let id = targetID, let p = c.retrievePeripherals(withIdentifiers: [id]).first {
                connect(p)
            } else {
                scanIfPossible()     // el primer YagiPinger-* (o el elegido) que aparezca
            }
        case .poweredOff: failOpen(.bluetoothOff)
        case .unauthorized: failOpen(.unauthorized)
        case .unsupported: failOpen(.bluetoothOff)
        default: break               // .unknown / .resetting: llegará centralManagerDidUpdateState
        }
    }

    private func connect(_ p: CBPeripheral) {
        central?.stopScan()
        peripheral = p
        p.delegate = self
        central?.connect(p, options: nil)
    }

    private func failOpen(_ e: LinkError) {
        central?.stopScan()
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
        peripheral = nil; rx = nil; tx = nil
        wantsOpen = false
        state = .failed(e)
        finishOpen(.failure(e))
    }

    private func finishOpen(_ r: Result<Void, Error>) {
        openTimer?.cancel()
        guard let c = openContinuation else { return }
        openContinuation = nil
        c.resume(with: r)
    }

    private func flush() {
        guard let p = peripheral, let rx else { return }
        while let first = outbox.first, p.canSendWriteWithoutResponse {
            p.writeValue(first, for: rx, type: .withoutResponse)
            outbox.removeFirst()
        }
    }
}

// MARK: - CoreBluetooth

extension BLELineTransport: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if scanning { scanIfPossible() }
        reportBluetoothAvailability()
        beginConnectIfPossible()
        if central.state == .poweredOff || central.state == .unauthorized, state == .ready {
            state = .failed(central.state == .poweredOff ? .bluetoothOff : .unauthorized)
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? p.name ?? ""
        guard name.hasPrefix(Self.namePrefix) else { return }
        found[p.identifier] = PingerDevice(id: p.identifier, name: name)
        peripherals[p.identifier] = p
        deviceContinuation.yield(found.values.sorted { $0.name < $1.name })
        if wantsOpen, peripheral == nil, targetID == nil || targetID == p.identifier { connect(p) }
    }

    func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
        p.discoverServices([Self.serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        failOpen(.deviceNotFound)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard p.identifier == peripheral?.identifier else { return }
        rx = nil; tx = nil; outbox.removeAll()
        assembler = LineAssembler()
        if openContinuation != nil { failOpen(.connectionLost) }
        else if state == .ready { state = .failed(.connectionLost) }
    }
}

extension BLELineTransport: CBPeripheralDelegate {
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let s = p.services?.first(where: { $0.uuid == Self.serviceUUID }) else { return failOpen(.deviceNotFound) }
        p.discoverCharacteristics([Self.rxUUID, Self.txUUID], for: s)
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        rx = s.characteristics?.first { $0.uuid == Self.rxUUID }
        tx = s.characteristics?.first { $0.uuid == Self.txUUID }
        guard error == nil, rx != nil, let tx else { return failOpen(.deviceNotFound) }
        p.setNotifyValue(true, for: tx)
    }

    func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
        guard c.uuid == Self.txUUID else { return }
        guard error == nil, c.isNotifying else { return failOpen(.writeFailed) }
        UserDefaults.standard.set(p.identifier.uuidString, forKey: Self.lastDeviceKey)
        assembler = LineAssembler()
        state = .ready
        finishOpen(.success(()))
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard error == nil, c.uuid == Self.txUUID, let data = c.value else { return }
        for line in assembler.feed(data) { lineContinuation.yield(line) }
    }

    func peripheralIsReady(toSendWriteWithoutResponse p: CBPeripheral) { flush() }
}
