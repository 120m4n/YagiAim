# Contrato: semántica de formato, parseo y redondeo

El port no puede usar las funciones "parecidas" de JavaScript, porque producen textos distintos en casos que la app sí ejerce. Este contrato fija cada punto y cómo se verifica.

## Vectores dorados (fuente de verdad)

`android-rn/tools/goldens/` contiene un programa Swift (`main.swift`) que se compila **junto a los archivos de la referencia sin modificarlos**:

```bash
swiftc -O MeshAzimuth/Geo.swift MeshAzimuth/AimInfo.swift MeshAzimuth/RepeaterStore.swift \
  MeshAzimuth/Link/LineCodec.swift MeshAzimuth/Link/LineTransport.swift MeshAzimuth/Link/PingerLink.swift \
  MeshAzimuth/Link/SimulatedPinger.swift MeshAzimuth/Session/*.swift \
  android-rn/tools/goldens/main.swift -o /tmp/goldens && /tmp/goldens > android-rn/__tests__/goldens/swift-goldens.json
```

Se ejecuta en macOS. `main.swift` evalúa cada entrada de la tabla de casos de este contrato y escribe `{"caso": "salida"}`. Los tests TS comparan contra ese JSON. **Si una salida de este contrato y el JSON dorado no coinciden, manda el JSON dorado**, y el contrato se corrige. Si `PingerLink.swift` no compila fuera de la app por dependencias de UI, se excluye de la línea de compilación (ninguna entrada de la tabla lo necesita).

---

## FS-01 `String(format:)` → `formatC`

Especificadores que usa la referencia (inventario completo por `grep` @ 2eda6d9): `%.0f`, `%.1f`, `%.2f`, `%.6f`, `%.\(n)f`, `%+.1f`, `%+.2f`, `%08X`, `%@`.

| Caso | Swift / C | `toFixed` de JS | Motivo |
|---|---|---|---|
| `%.2f` de 0.125 | `0.12` | `0.13` | printf redondea el valor binario exacto; en empate exacto, a par |
| `%.1f` de 61.25 | `61.2` | `61.3` | ídem |
| `%.0f` de 2.5 | `2` | `3` | ídem |
| `%+.2f` de −0.0 | `-0.00` | `0.00` (sin signo) | printf conserva el signo de −0.0 |
| `%+.2f` de 0.0 | `+0.00` | — | JS no tiene `+` |
| `%.0f` de −0.4 | `-0` | `-0` (con `toFixed`) / `0` (con `String`) | signo del cero |

Implementación exigida: conversión exacta del double a decimal (el algoritmo de redondeo de `printf` de glibc/Darwin: expansión decimal exacta del binario y luego empate a par) para N ≤ 6; signo explícito con `+`; `%08X` de un `UInt32` en mayúsculas rellenado a 8.

Prohibido en `src/`: `toFixed`, `toPrecision`, `Intl.NumberFormat` para estos textos (regla de lint `no-restricted-properties`).

Casos de cobertura obligatorios en los dorados: todos los cuartos de dB en [−32, 31.75] con `%+.2f`; todos los décimos en [−130.0, 0.0] con `%+.1f` y `%.1f`; los empates 0.125, 0.375, 61.25, −61.25, 2.5, −2.5; ±0.0.

## FS-02 `Double(String)` (parseo de números del protocolo y del editor)

- **Origen**: `LineCodec.number` (L150–153), `RepeaterEditor.parse` (L138), `altitudeText` (L171).
- **Swift**: `Double(text)` acepta la gramática de `strtod` **sin espacios**: signo opcional, decimal con o sin parte entera/fraccionaria, exponente, `inf`/`infinity`/`nan` (sin distinguir mayúsculas) y hexadecimal en coma flotante (`0x1p3`). Rechaza el vacío y los espacios al inicio o al final.
- **JS**: `Number(" 5") = 5`, `Number("") = 0`, `Number("0x10") = 16` (entero hex, no float hex), `parseFloat("5abc") = 5`. Ninguna sirve.
- **Resolución**: `parseSwiftDouble(s)` con esa gramática exacta. Casos dorados: `""`, `" 5"`, `"5 "`, `"+3.25"`, `"-6.00"`, `".5"`, `"5."`, `"1e3"`, `"1E-3"`, `"nan"`, `"NaN"`, `"inf"`, `"-Infinity"`, `"0x1p3"`, `"0x10"`, `"1_000"`, `"٣"` (dígito árabe), `"1,5"`.
- **Nota**: el editor sustituye `,` por `.` antes de parsear (`RepeaterViews.swift` L138, L171). En lat/lon además se recortan espacios (`trimmingCharacters(in: .whitespaces)`); en la altitud **no**. Se traspasa igual.

## FS-03 Enteros

| Uso | Swift | Resolución en TS |
|---|---|---|
| `LineCodec.uint` | solo dígitos ASCII, no vacío, `UInt(s)` (falla si desborda 64 bits) | regex `^[0-9]+$` + `BigInt` para el límite; luego las comprobaciones `≤ UInt32.max` / `≤ UInt8.max` de cada campo |
| `Int(kv["proto"])` en `#HELLO` | `Int(String)`: signo opcional `+`/`-`, dígitos ASCII, sin espacios, desbordamiento → nil | `parseSwiftInt` |
| `Int(config["rate"] ?? "") ?? 0` | ídem; un valor no entero → 0 | ídem |
| `Int(kv[1])` en el simulador | ídem | ídem |
| `Int(x)` de un `Double` | trunca hacia cero | `Math.trunc` |
| `Int(target)` (accesibilidad) | trunca | `Math.trunc` |
| `Int(tolerance)` | trunca | `Math.trunc` |

## FS-04 Redondeo

| Uso | Swift | JS ingenuo | Resolución |
|---|---|---|---|
| `.rounded()` (pérdida %, RSSI simulado) | al más cercano, empate **lejos de cero** (`-110.5 → -111`) | `Math.round(-110.5) = -110` | `roundHalfAwayFromZero` |
| `.rounded(.towardZero)` (cuantización del simulador) | trunca | — | `Math.trunc` |

## FS-05 `split` y recortes

| Uso | Swift | Resolución |
|---|---|---|
| campos de `P,`/`S,` | `split(",", omittingEmptySubsequences: false)` | `s.split(",")` (JS conserva los vacíos) |
| campos de `R,` | `split(",", maxSplits: 3, omittingEmptySubsequences: false)` | dividir en las 3 primeras comas y dejar el resto intacto (JS `split` con límite **descarta** el resto: no sirve) |
| `keyValues` | `split(" ")` (omite vacíos), clave hasta el primer `=` | `s.split(" ").filter(Boolean)` |
| `codeAndDetail` | `split(" ", maxSplits: 1, omittingEmptySubsequences: true)` | según dorado: casos `"range rate>=1000"`, `"range  rate>=1000"` (dos espacios), `" range x"`, `"range "` |
| `parse` | `trimmingCharacters(in: "\r\n")` en ambos extremos | recorte solo de `\r` y `\n` |
| Simulador | `trimmingCharacters(in: .whitespacesAndNewlines)` y `split(" ", maxSplits: 1)` | conjunto de espacios Unicode de Foundation; según dorado |
| Editor (lat/lon, hash) | `.whitespaces` (sin saltos de línea) | según dorado |

## FS-06 UTF-8 del ensamblador

`String(decoding: bytes, as: UTF8.self)` sustituye las secuencias inválidas por U+FFFD. Resolución: `new TextDecoder("utf-8", { fatal: false })`. La cantidad de U+FFFD por secuencia inválida sigue la recomendación "maximal subpart" en ambos; casos dorados: `C3`, `E2 82`, `F0 9F 98`, `FF`, `ED A0 80`.

## FS-07 Fechas

| Uso | Swift | Resolución |
|---|---|---|
| CSV `t_*_iso` | `ISO8601DateFormatter` con `[.withInternetDateTime, .withFractionalSeconds]` y zona del dispositivo: `2026-10-15T07:12:03.215-05:00`; en UTC escribe `Z` | formateador propio: 3 decimales y offset `±HH:MM` o `Z`. Si la fracción se trunca o se redondea **se toma del dorado** (casos con .2154, .2155, .9996 s) |
| Nombre del CSV | `DateFormatter` `en_US_POSIX`, `yyyyMMdd-HHmmss`, zona del dispositivo | formateador propio |
| Lista de sesiones y título | `Date.formatted(date: .abbreviated, time: .shortened)`: depende de la configuración regional del dispositivo (la referencia muestra `14 Oct 2026 at 5:28 PM`) | **No** se usa `Intl.DateTimeFormat` con opciones parecidas, porque produce otros separadores. Patrón de **`es_CO`** (región de referencia, C-9) y de `en_US` tomados del dorado (el generador formatea con `Locale(identifier:)` explícito). En otra región del dispositivo se usa su patrón si está en la tabla, si no el de `es_CO` |
| Persistencia | `Date` en `JSONEncoder` = segundos desde 2001-01-01 00:00:00 UTC (`Double`) | `swiftDate = (ms − 978 307 200 000) / 1000` |
| `location.last.t` | `timeIntervalSince1970` | segundos Unix (`Double`) |

## FS-08 Nombre de archivo seguro del CSV

`s.repeater.name.map { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") ? $0 : "_" }` recorre **caracteres extendidos (grafemas)**: un emoji compuesto o `ñ` descompuesta dan un solo `_`. Resolución: `Intl.Segmenter("und", {granularity: "grapheme"})` y una sola sustitución por grafema. Dorado: `"Cerro El Pico/Cali ñ"` → `Cerro_El_Pico_Cali__` (test existente), `"ñ"`, `"🇨🇴"`, `"👨‍👩‍👧"`.

## FS-09 Texto inicial del editor (`String(Double)`)

`latText = String(repeater.latitude)` usa la descripción más corta de Swift, que **siempre lleva parte decimal** y usa exponente fuera de [1e-4, 1e16):

| Valor | Swift | `String()` de JS |
|---|---|---|
| 0 (repetidor "Nuevo" desde "+") | `0.0` | `0` |
| −73.0 | `-73.0` | `-73` |
| 6.8403 | `6.8403` | `6.8403` |
| 0.00001 | `1e-05` | `0.00001` |
| 1012.0 (altitud) | `1012.0` | `1012` |

Resolución: `swiftDoubleDescription(x)` (dígitos más cortos de ida y vuelta, que JS ya calcula, más las reglas de presentación de Swift). Dorados: los de la tabla, más 1e16, 1.5e-5, −0.0 (`-0.0`), 123456789.123.

## FS-10 Tamaño de caché (`ByteCountFormatter`, `.file`)

Unidades decimales (1 KB = 1000 B), texto según la configuración regional y `Zero KB` para 0. Resolución: implementación propia contra dorados de 0, 1, 999, 1000, 1499, 1500, 999 999, 1 000 000, 12 345 678, 499 999 999, 500 000 000 bytes en `es_CO` y `en_US`.

## FS-11 Búsqueda y orden de la lista

| Uso | Swift | Resolución |
|---|---|---|
| Filtro | `localizedCaseInsensitiveContains`: sin distinguir mayúsculas, **sí** distingue acentos, según la región | `normalize("NFC")` + `toLocaleLowerCase(región)` + `includes` (dorados: "Pico"/"pico", "Cúcuta"/"cucuta" → no coincide) |
| Orden por nombre | `localizedCaseInsensitiveCompare == .orderedAscending` | `Intl.Collator(región, {sensitivity: "accent"}).compare` |
| Empates | orden de `sorted` de Swift (estable en la implementación de Swift 5) | `Array.prototype.sort` (estable en Hermes/ES2019) |

## FS-12 UUID

`UUID().uuidString` = mayúsculas con guiones. Resolución: `randomUUID().toUpperCase()`; la decodificación acepta minúsculas (el `UUID(uuidString:)` de Swift también las acepta) y las normaliza a mayúsculas al guardar.
