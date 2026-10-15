# Bench log: 004 Port a React Native (Android)

Plantillas de registro para las mediciones de `research.md` y los criterios que no se verifican con tests automáticos. Cada fila lleva la fecha, el dispositivo (modelo, versión de Android, versión de la app) y quién midió.

## T081 Verificación de Fused Orientation Provider

| Dispositivo | Android | Play Services | ¿FOP disponible? | Unidades de `headingErrorDegrees` (comparar con el valor de iOS en la misma situación) | ¿Indica norte magnético? ¿cómo? | Sin GPS: ¿rumbo magnético? |
|---|---|---|---|---|---|---|
| | | | | | | |

## R-3 Respuesta al escalón del rumbo suavizado (30°)

| Plataforma | Dispositivo | Repetición | t al 90 % (ms) | Eventos/s | Notas |
|---|---|---|---|---|---|
| iOS | | 1…10 | | | referencia |
| Android | | 1…10 | | | tasa del sensor usada: |

Criterio: mediana Android = mediana iOS ±20 %.

## R-4 Rumbo con el teléfono inclinado

| Inclinación | Objetivo (°) | iOS "Rumbo teléfono" | Android "Rumbo teléfono" | Diferencia |
|---|---|---|---|---|
| 0° (plano) | | | | |
| 45° | | | | |
| 80° | | | | |

## R-5 Filtro de escaneo por UUID

| Teléfono | Android | Con filtro de servicio: ¿aparece? | Tiempo hasta aparecer |
|---|---|---|---|
| | | | |
| | | | |

## SC-004 Paridad de sensores (lado a lado)

| Orientación | iOS rumbo (mediana de 10) | Android rumbo | Δ | iOS inclinación | Android inclinación | Δ | Elevación iOS / Android |
|---|---|---|---|---|---|---|---|
| N | | | | | | | |
| E | | | | | | | |
| S | | | | | | | |
| O | | | | | | | |

Criterio: Δ rumbo ≤ 2°, Δ inclinación ≤ 1°, Δ elevación ≤ 0.1°.

## SC-006 Banco BLE (pinger a < 1 m, repetidor `4F`, 22 dBm, omni)

| Medida | iOS (README) | Android | Criterio |
|---|---|---|---|
| Conexión BLE | ≈ 0.8 s | | ≤ 1.0 s |
| Comando → resultado | ≈ 1.4 s | | ≤ 1.6 s |
| SNR ↑ / SNR ↓ | +9.25…+10.75 / +8…+9.25 dB | | mismos rangos |
| RSSI ↓ | −32…−39 dBm | | mismo rango |
| RTT | 220…440 ms | | mismo rango |
| Pérdida (20 pings) | 0 % | | 0 % |
| MTU negociado | ≈ 185 | | ≥ 23 (registrar) |
