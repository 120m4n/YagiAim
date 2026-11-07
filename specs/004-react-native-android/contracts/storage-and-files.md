# Contrato: persistencia y archivos

Inventario completo, obtenido por `grep` de `forKey:`, `@AppStorage`, `UserDefaults` y `FileManager` @ 2eda6d9 (ver `inventory/keys.tsv`).

## SF-01 Claves clave-valor (`UserDefaults` → MMKV)

| Clave | Tipo Swift | Por defecto (sin clave) | Escribe | Lee | Notas |
|---|---|---|---|---|---|
| `onboarding.done` | `Bool` (`@AppStorage`) | `false` | `ContentView` al cerrar la guía | `ContentView` | — |
| `map.satellite` | `Bool` (`@AppStorage`) | `false` | botón de estilo | `ContentView` | — |
| `map.camera` | `[Double]` de 4 | ausente → seguir al usuario | `ContentView.onRegionChange` (cada cambio) | `ContentView.savedRegion` | válido si `count == 4`, \|lat\| ≤ 90, \|lon\| ≤ 180, deltas > 0 |
| `tolerance` | `Double` (`@AppStorage`) | `3.0` | deslizador | `AimView` | 1…15, paso 1 |
| `list.sortByDistance` | `Bool` (`@AppStorage`) | `true` | menú "Orden" | `RepeaterList` | — |
| `pinger.simulated` | `Bool` (`@AppStorage`) | `false` | *Acerca de* | factoría de transporte (al conectar), `PingerPicker` | — |
| `pinger.lastDevice` | `String` | ausente | transporte BLE al quedar notificando | transporte BLE, selector ("último usado") | iOS: UUID de CoreBluetooth; Android: MAC (PM-09) |
| `repeaters.v1` | `Data` (JSON `[Repeater]`) | `[]` | `RepeaterStore` en cada cambio | `RepeaterStore.init` | JSON inválido → `[]` (sin error visible) |
| `repeaters.selected` | `String?` (UUID) | ausente | `RepeaterStore.selectedID` | `RepeaterStore.init` | `nil` → **borra** la clave |
| `boom.offset` | `Double` | `0` | `LocationManager.headingOffset` | `LocationManager` | — |
| `location.last` | `[String: Double]` | ausente | `LocationManager.persist` (máx. cada 5 s) | `LocationManager.init` | claves `lat, lon, alt, h, v, t` (`t` en segundos Unix); si falta alguna se ignora entera |

En MMKV: `Bool` → `setBool`; `Double` → `setNumber`; `String` → `setString`; `[Double]`, `[String: Double]` y `Data` JSON → `setString` con el JSON. El tipo se respeta al leer: si un tipo distinto queda guardado, se usa el valor por defecto, como `UserDefaults` con un tipo inesperado.

## SF-02 Archivos

| Archivo | iOS | Android | Ciclo de vida |
|---|---|---|---|
| Sesiones | `Application Support/Sessions/<UUID>.json` | `<filesDir>/Sessions/<UUID>.json` | Permanente; se borra al desinstalar. Escritura atómica |
| Export de repetidores | `tmp/MeshAzimuth-repetidores.json` | `<cacheDir>/MeshAzimuth-repetidores.json` | Se reescribe en cada cambio de la lista mientras la lista está abierta (`onChange(initial: true)`) |
| CSV de sesión | `tmp/<SessionCSV.fileName>` | `<cacheDir>/<mismo nombre>` | Se escribe al abrir la vista de la sesión (`.task`) |
| Caché de teselas | `URLCache` (memoria 20 MB, disco 500 MB) | caché del motor de mapa (500 MB) | Se vacía desde *Acerca de* |

Se comparten con la hoja de compartir del sistema (`ShareLink` → `Intent.ACTION_SEND` con un URI `content://` de `FileProvider`). MIME: `text/csv` y `application/json`. La importación usa el selector de documentos (`fileImporter([.json])` → SAF `ACTION_OPEN_DOCUMENT` con `application/json`).

## SF-03 JSON de repetidores (persistido y exportado)

Esquema (`Repeater: Codable` sintetizado):

```json
[
  {
    "altitude" : 1012,
    "hashPrefix" : "9A",
    "id" : "6F1C2D3E-....-....-....-............",
    "latitude" : 6.8403,
    "longitude" : -73.2265,
    "name" : "pico de la vieja"
  }
]
```

- `altitude` y `hashPrefix` se **omiten** cuando son `nil` (`encodeIfPresent`); al decodificar, si faltan → `nil`.
- `id` en mayúsculas (FS-12).
- **Exportación**: `outputFormatting = [.prettyPrinted, .sortedKeys]`. El formato exacto del texto de Apple (sangría de 2 espacios, `"clave" : valor` con espacio antes de los dos puntos, `/` escapado como `\/`, presentación de los números) **se toma del dorado** generado con `JSONEncoder` (T013): el archivo exportado por Android debe ser idéntico byte a byte al que exportaría iOS con la misma lista.
- **Persistencia** (`repeaters.v1`): `JSONEncoder()` por defecto (sin orden de claves). Solo se exige compatibilidad de lectura en ambos sentidos.
- **Importación**: `JSONDecoder().decode([Repeater].self)`: un objeto que no cumpla el esquema invalida **todo** el archivo (mensaje "El archivo no tiene el formato esperado (lista JSON de repetidores)."), igual que en Swift. Las claves desconocidas se ignoran.

## SF-04 JSON de sesión

`JSONEncoder` con `outputFormatting = [.sortedKeys]` (sin `prettyPrinted`). Estructura = `Session` → `repeater` (SF-03), `readings: [Reading]`, `samples: [Sample]` con `result: PingResult`.

- Fechas (`started`, `tTx`, `tRx`): `Double` en segundos desde 2001-01-01 UTC (FS-07).
- `PingResult.status`: `"ok" | "timeout" | "busy" | "txerr"`.
- Opcionales `nil` omitidos.
- `UInt32`/`UInt8`/`Int`: números enteros JSON.

Lectura: una sesión que no decodifique se omite de la lista (`compactMap`), sin error visible.

## SF-05 Migración

No hay migración entre plataformas: cada instalación empieza vacía, como una instalación nueva de iOS. El único traspaso entre plataformas que existe en la referencia es exportar e importar el JSON de repetidores (SF-03), y debe funcionar en los dos sentidos.
