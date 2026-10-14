# Quickstart: 003 BLE NUS + YagiAim

## Firmware

```bash
cd firmware/pinger
pio test -e native
pio run -e xiao_nrf52 -t upload
python3 tools/ble_smoke.py          # bleak: busca YagiPinger-*, HELLO, CFG?, PING
```

Prueba manual con **nRF Connect** (iOS/Android): conectar a `YagiPinger-XXXX` → servicio NUS → habilitar notify en TX (`…0003`) → escribir en RX (`…0002`) `PING` + salto de línea (UTF-8) → se recibe `P,…`.

## App

```bash
cd ios
xcodegen generate
xcodebuild test -scheme YagiAim -destination 'platform=iOS Simulator,name=iPhone 16'
```

El simulador no tiene Bluetooth: los tests usan `SimulatedPinger`. En la app, *Ajustes de depuración → Pinger simulado* permite probar toda la UI sin hardware.

## En campo

1. Edita el repetidor: añade **Prefijo hash** (2 hex).
2. Monta el XIAO y el iPhone en el boom (teléfono plano, borde superior hacia el director).
3. Pantalla de apuntamiento → **Conectar pinger** → elige `YagiPinger-XXXX`.
4. Activa **En vivo** y gira despacio: la sparkline muestra el SNR de subida.
5. En cada orientación que quieras registrar: quédate quieto → **Medir aquí** (5 pings, ~8 s).
6. **Sesión → Exportar CSV**.

Lecturas mínimas sugeridas (preparación de la fase 004): 0°, ±15°, ±30°, ±60° y 180° respecto al azimut.
