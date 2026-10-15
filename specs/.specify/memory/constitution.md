<!--
Sync Impact Report
- Version: 1.1.0 → 1.2.0 (MINOR: se añade la plataforma watchOS — app del reloj como espejo de la brújula del iPhone, spec 005)
- Anterior: 1.0.0 → 1.1.0 (principio VII y plataforma Android/React Native)
- Principios añadidos: VII. Paridad con la referencia iOS
- Secciones modificadas: Restricciones de hardware y RF (plataformas), Flujo de desarrollo (gates), Governance (Check I–VII)
- Plantillas: plan-template.md ⚠ el Constitution Check debe cubrir I–VII
- TODOs diferidos: ninguno nuevo
- Historial: 0.0.0 → 1.0.0 (ratificación inicial)
- Principios añadidos: I–VI
- Secciones añadidas: Restricciones de hardware y RF, Flujo de desarrollo
- Plantillas: plan-template.md ✅ (Constitution Check referencia I–VI) | spec-template.md ✅ | tasks-template.md ✅
- TODOs diferidos: RADIO_PRESET_CALI (ver specs/001 FR-003)
-->

# YagiAim Constitution

Sistema para orientar una antena Yagi-Uda hacia un repetidor MeshCore y **validar la alineación con tramas reales de la mesh**, sin ejecutar el core de MeshCore en el dispositivo de prueba.

## Core Principles

### I. Compatibilidad de trama verificada, no supuesta (NON-NEGOTIABLE)

- Toda trama que el sistema emite o interpreta DEBE validarse contra el parser real de MeshCore (`mesh::Packet::readFrom` / `writeTo`) compilado en host, a partir de un commit **fijado** de `meshcore-dev/MeshCore` (submódulo `third_party/MeshCore`).
- La lógica de reenvío del repetidor que el sistema asume (TRACE en `Mesh.cpp`) DEBE estar cubierta por un guardián de deriva que falle cuando cambie el código upstream.
- Subir el commit fijado es un cambio explícito: PR propio, tests verdes y nota en `research.md` de la fase 002.

### II. Buen ciudadano de la mesh

- El pinger SOLO emite paquetes `PAYLOAD_TYPE_TRACE` con `ROUTE_TYPE_DIRECT`. Nunca flood, nunca adverts, nunca suplanta identidades.
- El intervalo entre pings DEBE ser ≥ 1000 ms y el ciclo de trabajo propio de TX ≤ 10 % en cualquier ventana de 60 s. Esto se aplica en firmware y no puede desactivarse desde la interfaz.
- La potencia de TX por defecto es baja (2 dBm). Subirla es una acción explícita del usuario.
- El modo monitor (`MON`) es solo de recepción.

### III. Núcleo puro, cascarones delgados

- La lógica de protocolo (armar y parsear TRACE, codificar líneas, estadísticas) vive en `firmware/pinger/lib/tracecore/`. Es C++17 sin Arduino, RadioLib ni BLE y compila igual en nRF52 y en host.
- Radio, Serial, BLE y la UI de iOS son cascarones: traducen eventos y no contienen reglas de protocolo.

### IV. Un solo protocolo de líneas, versionado

- Serial USB y BLE NUS transportan el **mismo** protocolo de texto (`proto=1`), definido en `specs/001-trace-pinger-firmware/contracts/line-protocol.md`.
- Los fixtures de líneas (`firmware/pinger/test/fixtures/lines/*.txt`) son la fuente de verdad compartida y los consumen los tests C++ y Swift.
- Un cambio incompatible incrementa `proto` y se documenta.

### V. Test-first en el protocolo; evidencia de campo en RF

- Para `tracecore` y para el codec Swift: test escrito y fallando → implementación → verde.
- Lo que depende de RF (alcance, SNR, colisiones) se valida en campo y se **registra** con capturas crudas (`MON`) que pasan a ser fixtures de regresión.

### VI. Simplicidad

- Sin criptografía, sin identidad, sin tablas de rutas, sin contactos.
- La única persistencia del firmware es su configuración. La app persiste repetidores y sesiones de medición.
- Cualquier dependencia nueva se justifica en el `plan.md` de la feature.

### VII. Paridad con la referencia iOS (traspaso directo)

- La app iOS de este repositorio (`MeshAzimuth/`, commit de referencia fijado en `specs/004-react-native-android/plan.md`) es la **especificación ejecutable** de cualquier otra plataforma. Un port NO añade, quita ni reinterpreta funciones, textos, reglas, tiempos ni formatos.
- Toda divergencia inevitable por plataforma, licencia o hardware DEBE estar registrada en `contracts/platform-mapping.md` del port, con su causa y la decisión aprobada. Una divergencia no registrada es un defecto.
- Los tests XCTest y los fixtures de líneas se portan 1:1 y deben pasar sin modificar sus expectativas.
- La aceptación visual se mide contra capturas de referencia del iPhone, con un procedimiento reproducible y umbrales escritos.

## Restricciones de hardware y RF

- Hardware de referencia: Seeed XIAO nRF52840 + Wio-SX1262 (pines según `variants/xiao_nrf52` de MeshCore).
- Parámetros de radio idénticos a los de la mesh local: frecuencia, BW, SF, CR, sync word `0x12`, CRC on, header explícito, preámbulo 32 (SF ≤ 8) o 16 (SF ≥ 9).
- Banda ISM 902–928 MHz. La potencia máxima configurable DEBE respetar la regulación colombiana vigente (a verificar antes de liberar la fase 001).
- iOS 17+, SwiftUI y CoreBluetooth: app de referencia MeshAzimuth (`MeshAzimuth/`).
- Android (React Native): port de la app de referencia según el principio VII (`specs/004-react-native-android`).
- watchOS 8+ (Apple Watch Series 3 en adelante): app del reloj incluida en la app iOS, sin sensores propios; muestra el estado de apuntamiento que calcula el iPhone (`specs/005-watch-compass-lite`). Es exclusiva de iOS: en el port Android "no aplica".

## Flujo de desarrollo

- Spec Kit: `spec.md → plan.md → tasks.md → implementación`, una carpeta `specs/NNN-*` por fase y una rama `NNN-*` por fase.
- Gates de PR: `pio test -e native` verde, `xcodebuild test` verde (cuando aplica), el guardián de deriva verde y, para el port Android, la suite de paridad (Jest) y la suite visual verdes.
- Idioma: documentación en español; identificadores de código en inglés.

## Governance

Esta constitución prevalece sobre cualquier otra práctica del repositorio. Las enmiendas requieren PR con el Sync Impact Report actualizado y versionado semántico: MAJOR si se elimina o redefine un principio, MINOR si se añade uno, PATCH si son aclaraciones. Todo `plan.md` DEBE incluir un *Constitution Check* contra I–VII.

**Version**: 1.2.0 | **Ratified**: 2026-10-13 | **Last Amended**: 2026-10-15
