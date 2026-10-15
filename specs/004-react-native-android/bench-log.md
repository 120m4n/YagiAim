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

## Notas de implementación (2026-10-15)

Decisiones y límites encontrados al implementar, a verificar en dispositivo:

- **PM-27, desenfoque sobre el mapa**: el mapa es una `SurfaceView` de GL y no se puede capturar para desenfocar; sobre el mapa se usa un sólido translúcido.
- **PM-07, pitch**: se calcula del vector de rotación (`-orientation[1]`), no del cuaternión de FOP, porque su convención no está verificada. T081 puede cambiarlo.
- **PM-01, caché**: 500 MB y `User-Agent` vía `OfflineManager`/`TransformRequestManager`. «Servir vencido sin red» no está garantizado por MapLibre; si falla, interceptar la carga (PM-01).
- **R-3, tasa del rumbo**: 20 Hz (periodo de 50 ms de FOP) provisional.
- **R-12, sparkline**: dominio con números «bonitos» 1-2-5, sin forzar el cero; pendiente de medir contra Swift Charts.
- **Doble toque del mapa**: un toque simple solo da de alta tras 300 ms sin otro toque; pendiente de comprobar que MapLibre no dispara `onPress` en el zoom.
- **Defectos de Swift traspasados (no se corrigen)**: (1) `PingerLink` lanza `requestInFlight` si «Medir aquí» llega con un PING en vuelo del modo en vivo; (2) `LineCodec.summary` hace `Int(UInt)` y se cae con n ≥ 2⁶³ (los dorados lo excluyen); (3) `SessionCSV.escape` no entrecomilla un `\r\n` porque Swift lo trata como un solo carácter.
- **Dependencias añadidas al plan**: `expo-location` (ubicación fusionada, PM-04), `react-native-svg` (íconos), `zustand`, `expo-system-ui`; `expo-file-system` hace de selector SAF (se descartó `expo-document-picker`).
