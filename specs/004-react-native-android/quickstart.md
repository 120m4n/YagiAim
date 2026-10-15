# Quickstart: 004 Port a React Native (Android)

## Requisitos

- Node LTS, JDK 17, Android SDK (API 35, emulador x86_64) y, para los dorados, macOS con Xcode (`swiftc`).
- El repo completo: el port lee `MeshAzimuthTests/Fixtures/lines` y `docs/img` desde su ubicación original.

## Núcleo y paridad (sin dispositivo)

```bash
cd android-rn
npm ci
npm test -- core        # 46 tests portados + semántica de formato + dorados
```

## Regenerar dorados e inventarios (al cambiar el commit de referencia)

```bash
# en macOS, desde la raíz del repo
swiftc -O MeshAzimuth/Geo.swift MeshAzimuth/AimInfo.swift MeshAzimuth/RepeaterStore.swift \
  MeshAzimuth/Link/LineCodec.swift MeshAzimuth/Link/LineTransport.swift MeshAzimuth/Link/SimulatedPinger.swift \
  MeshAzimuth/Session/*.swift android-rn/tools/goldens/main.swift -o /tmp/goldens
/tmp/goldens > android-rn/__tests__/goldens/swift-goldens.json
python3 specs/004-react-native-android/contracts/inventory/inventory.py
```

## App en el emulador

```bash
cd android-rn
npx expo prebuild --platform android
npx expo run:android            # development build
```

Pinger sin hardware: *Acerca de → Depuración → Pinger simulado* (igual que en iOS).

## Suite visual

```bash
npm run visual:avd              # crea y prepara el AVD de referencia (VA-2)
npm run visual                  # 61 estados → visual/report/index.html
```

## Banco y campo

- `bench-log.md`: plantillas para R-3, R-4, R-5, SC-004, SC-006 y la verificación de FOP (T081).
- SC-006: pinger del banco (repetidor `4F`, 22 dBm, < 1 m), 20 pings en "En vivo", y anotar la conexión, el tiempo por ping, SNR, RSSI, RTT y la pérdida.
