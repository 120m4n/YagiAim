# Research: orientar con una baliza CW

## R-1 ¿Por qué una baliza y no TRACE para enlaces nuevos?

| | TRACE (hoy) | Baliza + `MEAS` |
|---|---|---|
| Lecturas por segundo | ~0,7 (≈ 1,4 s por ping) | ~6 |
| Resolución | SNR 0,25 dB; RSSI de paquete en dB enteros | 0,5 dB, media de 32–64 lecturas |
| Tiempo en el aire del pinger | límite del 10 % | ninguno: no transmite |
| Necesita | un repetidor configurado en la malla | una placa con el firmware de baliza en el otro extremo |
| Satura | el SNR hacia +10 dB | el RSSI hacia −50 dBm |

Decisión: la baliza para enlaces propios nuevos; TRACE sigue para repetidores existentes.

## R-2 Precisión: el máximo es plano, la bisección no

Yagi de 3 elementos, haz de −3 dB de ~65°. Pérdida aproximada cerca del máximo: 12·(θ/65)² dB, es decir ≈ 0,3 / 0,6 / 1,1 / 2,6 dB a 10 / 15 / 20 / 30°. Con 0,5 dB de resolución y algún dB de variación por el cuerpo y el entorno, el máximo solo se sitúa a unos ±20°.

En los puntos de −3 dB la pendiente es de unos 0,2 dB/°, así que 0,5 dB de error son ±2–3° por lado. El centro de los dos cruces queda a **±3–5°**. Es la técnica clásica de orientar por los puntos de media potencia.

Decisión: la bisección (FR-024) es el resultado principal; el máximo retenido, solo una guía.

## R-3 Bucle de medida

`MEAS 32` tarda ≈ 70 ms en el pinger. Con la escritura BLE `.withoutResponse` y la notificación de vuelta (unos 50–100 ms), se espera ~6 lecturas/s encadenando peticiones con el `request()` actual (una petición a la vez). No se usa `MEAS wait=`: en este modo el teléfono está en el boom, al lado del pinger.

Decisión: un `Task` como `runLive()`, sin pausa entre peticiones, que trata `!ERR state busy` como "reintenta en el siguiente ciclo".

## R-4 Rumbo de cada lectura

Se toma `loc.heading` al **recibir** la `M` (la medida termina justo antes). La ventana de `MEAS 32` dura ~70 ms; girando a 20°/s el rumbo cambia ~1,4° dentro de ella, por debajo de la celda de 2° de la bisección. La guía pide barrer despacio (≤ 20°/s).

## R-5 Piso y ventana

- Piso: un `MEAS 64` a 1 MHz de la baliza al activar el modo (la baliza ocupa unos kHz; a 1 MHz solo hay ruido).
- Nivel útil para la bisección: piso + 10 dB. Basta con distinguir 3 dB de caída; es menos exigente que comparar antenas, donde se piden 20 dB.
- Tope: −50 dBm. Por encima se aplana el máximo por compresión del receptor.

## R-6 Alcance esperado

Baliza high (14 dBm) con antena omni de 2 dBi y Yagi de 10 dBi en el pinger, en espacio libre a 914 MHz: ≈ −52 dBm a 200 m, −66 dBm a 1 km, −86 dBm a 10 km. Cerca del límite útil (piso + 10 ≈ −89 dBm) hacia 10–15 km; en campo real, menos. Para enlaces más largos: Yagi también en la baliza (+8 dB) o un nivel de 22 dBm (cambio pequeño en el firmware de la baliza, fuera de esta fase).

## R-7 Fixtures

`tools/sync_fixtures.sh` copia los fixtures `proto=1` del repo MeshCore y no se toca (FR-001). El fixture de la línea `M` vive en `ping-ponger-meshcore`. Se copia **solo** `events_m.txt` a `MeshAzimuthTests/Fixtures/beacon/` con un script aparte, `tools/sync_beacon_fixtures.sh` (`PINGPONGER_DIR`, `--check`), para no mezclar fixtures `proto=2` con los `proto=1`.

## R-8 Tono

`AVAudioEngine` con un `AVAudioSourceNode` que genera un seno. La frecuencia se ajusta suavizada (≤ 20 Hz de cambio por buffer, para que no cruja) en función de `nivel − máximo retenido`. Se detiene con `scenePhase != .active`. Sin dependencias.
