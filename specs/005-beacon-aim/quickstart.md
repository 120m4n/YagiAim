# Quickstart: orientar con baliza

## Sin hardware (simulador)

1. Abrir la app en el simulador → Acerca de → Depuración → **Pinger simulado** y elegir **baliza** (FR-028).
2. Elegir un punto en el mapa y entrar en la pantalla de apuntamiento: aparece la tarjeta **Baliza**.
3. Mover el rumbo simulado de un lado a otro del azimut: el nivel sube hacia el azimut y la bisección propone un centro a ±3° (SC-003).

Tests: `xcodebuild test -scheme MeshAzimuth -destination 'platform=iOS Simulator,name=ref'`.

## Con placas

Firmware en `ping-ponger-meshcore` (rama `exp/analizador-pobre`), desde `firmware/`:

```bash
pio run -e ProMicro_trace_catcher -t upload       # catcher 0.5.1 (o Xiao_nrf52_trace_catcher)
pio run -e Xiao_nrf52_cw_beacon_high -t upload    # baliza: low/mid/high según distancia (ver su FLASHING.md)
```

1. **Sitio B** (hacia donde se apunta): la baliza en el mástil, con su antena, y alimentación. El LED da 1, 2 o 3 destellos según el nivel.
2. **Sitio A**: Yagi con el teléfono en el boom y el pinger pegado (el BLE de la Faketec llega a ~1 m). En el mapa, el punto del sitio B con la frecuencia de la baliza (914.000 por defecto).
3. Conectar el catcher `PingPong-CA-…` → tarjeta **Baliza**: comprobar que el nivel sale del piso (≈ −99 dBm) y queda por debajo de −50 dBm.
4. Barrer **despacio** (≤ 20°/s) de lado a lado, más allá de donde la señal cae 3 dB, con el brazo fuera del haz. Repetir hasta que la app proponga el centro.
5. "Usar como objetivo" y fijar la Yagi con la brújula.
6. Llevar la baliza al sitio A y repetir en B.

## Comprobar que no se degradó nada

Con un `YagiPinger-…` (`proto=1`) y un repetidor: conectar, "En vivo", "Medir aquí", sesión y exportar CSV. Todo igual que antes de esta fase.
