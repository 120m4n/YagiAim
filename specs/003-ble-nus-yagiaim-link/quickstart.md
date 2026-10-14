# Quickstart: 003 BLE NUS + MeshAzimuth

## Firmware (repo Meshcore)

```bash
cd /Users/120m4n/GitHub/Meshcore
./examples/trace_pinger/run_tests.sh                        # lógica + interop + fixtures
pio run -e Xiao_nrf52_trace_pinger -t upload                # doble reset si pide bootloader
python3 examples/trace_pinger/tools/ble_smoke.py            # bleak desde la Mac: busca YagiPinger-*, HELLO, CFG?, PING
```

Prueba manual con **nRF Connect** (iOS/Android): conectar a `YagiPinger-XXXX` → servicio NUS → habilitar notify en TX (`…0003`) → escribir en RX (`…0002`) `PING` + salto de línea (UTF-8) → se recibe `P,…`.

## App (repo MeshAzimuth)

```bash
cd /Users/120m4n/GitHub/MeshAzimuth
./tools/sync_fixtures.sh --check                            # los fixtures copiados coinciden con los de Meshcore
xcodegen generate
xcodebuild test -scheme MeshAzimuth -destination 'platform=iOS Simulator,name=ref'
```

El simulador no tiene Bluetooth: los tests usan `SimulatedPinger`. En la app, *Ajustes de depuración → Pinger simulado* permite probar toda la UI sin hardware. El banco BLE real (T034) usa un iPhone físico.

## En campo

1. Edita el repetidor: añade **Prefijo hash** (2 hex).
2. Monta el XIAO y el iPhone en el boom (teléfono plano, borde superior hacia el director).
3. Pantalla de apuntamiento → **Conectar pinger** → elige `YagiPinger-XXXX`.
4. Activa **En vivo** (un ping cada 2 s) y gira despacio: la sparkline muestra el SNR de subida.
5. En cada orientación que quieras registrar: quédate quieto → **Medir aquí** (5 pings, ~8 s).
6. **Sesión → Exportar CSV**.

Lecturas mínimas sugeridas (preparación de la fase 004): 0°, ±15°, ±30°, ±60° y 180° respecto al azimut.
