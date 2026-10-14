# Implementation Plan: Pinger TRACE mínimo

**Branch**: `001-trace-pinger-firmware` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-trace-pinger-firmware/spec.md`

## Summary

Firmware para XIAO nRF52840 + Wio-SX1262 que emite tramas TRACE de un salto hacia un repetidor MeshCore y reporta por Serial el SNR de subida (leído del eco), el SNR/RSSI de bajada y el RTT, con ráfagas y medianas. La lógica de protocolo va en `tracecore`, una librería C++ pura testeable en host. El cascarón Arduino solo maneja radio, puerto serie y flash. No se ejecuta el core de MeshCore.

## Technical Context

**Language/Version**: C++17 (arm-none-eabi-gcc del framework Adafruit nRF52; g++/clang en host). El framework Adafruit compila por defecto con `-std=gnu++11`, así que el entorno `xiao_nrf52` necesita `build_unflags = -std=gnu++11` y `build_flags = -std=gnu++17`.

**Primary Dependencies**: PlatformIO con `platform = nordicnrf52` y `framework = arduino`.
- `board = seeed-xiao-afruitnrf52-nrf52840`, usando `boards_dir = ${sysenv.MESHCORE_DIR}/boards`, con `MESHCORE_DIR=/Users/120m4n/GitHub/Meshcore` (fork en la rama `feature/i2c-actuator-public-channel`, commit `362ea302`). El JSON existe en ese repo (verificado). T002 comprueba si PlatformIO ya trae uno equivalente y confirma el ldscript `nrf52840_s140_v7.ld`.
- `platform_packages = framework-arduinoadafruitnrf52 @ https://github.com/meshcore-dev/Adafruit_nRF52_Arduino#d541301` (idéntico al `platformio.ini` de MeshCore, verificado). Es el fork de MeshCore con el parche BLE contra bloqueos por conexiones rápidas (PR #1177/#1295); hace falta en la fase 003.
- RadioLib al mismo commit que MeshCore (`6d89348`).
- `InternalFileSystem` (Adafruit).
- Host: GoogleTest 1.17.

**Storage**: LittleFS interno, `/pinger.cfg` (≤ 64 B)

**Testing**: `pio test -e native` (gtest) para `tracecore`; pruebas de banco con repetidor real para RF

**Target Platform**: nRF52840 (XIAO), SX1262 a 902–928 MHz

**Project Type**: firmware embebido + librería portable

**Performance Goals**: RX activo ≤ 10 ms después de TX done; latencia comando→`P,` ≤ 1.6 s (SF10/BW250, preset por defecto)

**Constraints**: rate ≥ 1 s, duty ≤ 10 %/60 s, solo TRACE/DIRECT, RAM de `tracecore` < 4 KB, sin heap en el camino caliente

**Scale/Scope**: 1 dispositivo, 1 repetidor objetivo a la vez; unas 600 LOC de firmware + 400 de tests

## Constitution Check

| Principio | Cumple | Cómo |
|---|---|---|
| I. Compatibilidad verificada | ✅ | El builder y parser de `tracecore` se validan contra `Packet::readFrom` upstream en la fase 002. En 001 hay tests de golden bytes del contrato. |
| II. Buen ciudadano | ✅ | FR-007/FR-008. El limitador de duty está en `tracecore` y tiene test. El único `transmit()` del firmware recibe bytes de `TraceFrame::build`. |
| III. Núcleo puro | ✅ | `lib/tracecore` sin `#include <Arduino.h>`, verificado en CI por un grep que falla el build. |
| IV. Protocolo único | ✅ | `LineCodec` en `tracecore`; fixtures en `test/fixtures/lines`. |
| V. Test-first | ✅ | `tasks.md` ordena los tests antes de la implementación en cada historia. |
| VI. Simplicidad | ✅ | Sin cripto, identidad ni tablas. Única dependencia externa: RadioLib. |

Re-check post-diseño: ✅, sin violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/001-trace-pinger-firmware/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── trace-frame.md
│   └── line-protocol.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
firmware/pinger/
├── platformio.ini                 # envs: xiao_nrf52, native
├── src/                           # cascarón Arduino (solo xiao_nrf52)
│   ├── main.cpp                   # setup/loop, despacho de líneas
│   ├── RadioShell.{h,cpp}         # RadioLib SX1262, ISR DIO1, CAD
│   ├── SerialTransport.{h,cpp}    # lectura de líneas, escritura atómica
│   ├── ConfigStore.{h,cpp}        # LittleFS /pinger.cfg
│   └── board_xiao.h               # pines (copiados de variants/xiao_nrf52)
├── lib/tracecore/
│   ├── library.json
│   ├── include/tracecore/
│   │   ├── TraceFrame.h           # build(), parseEcho()
│   │   ├── LineCodec.h            # format P/S/R/#, parse comandos
│   │   ├── Pinger.h               # máquina de estados pura
│   │   ├── DutyLimiter.h
│   │   ├── Airtime.h              # ToA Semtech + timeout auto
│   │   ├── Stats.h                # mediana
│   │   └── Config.h               # RadioConfig, PingerConfig, validate(), (de)serialize
│   └── src/*.cpp
├── test/
│   ├── fixtures/lines/*.txt
│   ├── test_trace_frame/
│   ├── test_line_codec/
│   ├── test_pinger_fsm/
│   ├── test_duty_limiter/
│   ├── test_airtime/
│   └── test_config/
└── tools/
    └── pinger_cli.py              # cliente serie opcional (pyserial) con log CSV

# Sin submódulo: el core vive en $MESHCORE_DIR (/Users/120m4n/GitHub/Meshcore @ 362ea302).
# La fase 002 lo referencia por esa ruta. El commit se registra en firmware/pinger/UPSTREAM.md.
```

**Structure Decision**: Un proyecto PlatformIO con dos entornos. `xiao_nrf52` compila `src/` + `tracecore`; `native` compila solo `tracecore` + tests. Así el principio III se cumple por construcción: si `tracecore` incluyera Arduino, `native` no compilaría.

## Diseño de la interfaz `tracecore::Pinger`

```cpp
namespace tracecore {
struct Action {               // lo que el cascarón debe hacer
  enum Kind { None, Transmit /* CAD y luego TX */, StartRx, Standby, Reconfigure } kind;
  const uint8_t* bytes; uint8_t len;
};
class Pinger {
public:
  explicit Pinger(PingerConfig cfg, Rng& rng, LineSink& out);
  Action onCommand(std::string_view line, uint32_t now);
  Action onTxDone(uint32_t now, bool ok);
  Action onChannelBusy(uint32_t now);
  Action onRx(const uint8_t* b, uint8_t n, float rssi, float snr, uint32_t now);
  Action tick(uint32_t now);  // timeouts, rate, duty
};
}
```

El cascarón Arduino en `loop()`: lee líneas → `onCommand`; consulta la bandera de DIO1 → `onTxDone`/`onRx`; llama `tick(millis())` y ejecuta la `Action` devuelta.

**CAD y reintentos**: `Action::Transmit` significa "hacer CAD y, si el canal está libre, transmitir". Si está ocupado, el shell llama `onChannelBusy`. El `Pinger` cuenta los intentos y, hasta 3, programa el reintento en `tick()` tras un backoff `nextInt(1,4)×120 ms` (mismo criterio que `Mesh::getCADFailRetryDelay`). Al tercer fallo reporta `busy`. El shell no decide reintentos.

**Cadencia**: el siguiente ping empieza en `max(inicio_anterior + rate, reporte_anterior)` y solo si el `DutyLimiter` lo permite.

## Complexity Tracking

Sin violaciones.
