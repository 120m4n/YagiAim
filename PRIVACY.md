# Política de privacidad — MeshAzimuth

Última actualización: 2026-10-14

MeshAzimuth no tiene cuentas, no usa analítica ni publicidad, y no envía tus datos a servidores del desarrollador.

## Qué datos usa la app
- **Ubicación precisa (GPS)** y **brújula**: se usan solo en el dispositivo para calcular azimut, distancia y elevación hacia el repetidor. No se transmiten ni se comparten.
- **Repetidores, preferencias, última ubicación y región del mapa**: se guardan localmente en el dispositivo (`UserDefaults`). Si exportas la lista de repetidores, el archivo lo compartes tú, de forma manual.
- **Sensores de movimiento**: se usan en pantalla de apuntamiento para medir la inclinación; no se guardan.
- **Bluetooth**: si usas el pinger LoRa, la app se conecta por Bluetooth a ese dispositivo (`YagiPinger-…`) para enviarle comandos y recibir las mediciones del enlace. No se conecta a ningún otro dispositivo y no comparte datos con terceros.
- **Sesiones de medición**: al tocar «Medir aquí» se guardan en el dispositivo (`Application Support/Sessions`, archivos JSON) las lecturas del pinger junto con el rumbo, la ubicación del teléfono en cada muestra y el repetidor. Solo salen del teléfono si tú las exportas a CSV y las compartes.

## Conexiones de red
- **Mapa estándar:** la app descarga teselas de `tile.openstreetmap.org` (OpenStreetMap Foundation). Esa petición incluye las coordenadas de la tesela y tu dirección IP; se rige por la [política de privacidad de OSMF](https://osmfoundation.org/wiki/Privacy_Policy). Las teselas vistas se guardan en caché local (hasta 500 MB) y puedes borrarlas desde *Acerca de*.
- **Mapa satélite:** lo proporciona Apple Maps (MapKit) y se rige por la política de Apple.

## Android
La versión de Android (`co.electrosoftware.meshazimuth`) usa los mismos datos con el mismo propósito y no recoge ni comparte nada: sin cuentas, sin analítica, sin publicidad.
- **Almacenamiento local:** preferencias, repetidores, última ubicación y región del mapa en el almacenamiento privado de la app (MMKV); sesiones de medición en `files/Sessions` (JSON). Se borran al desinstalar.
- **Permisos:** ubicación precisa (azimut y distancia, solo en el dispositivo), Bluetooth (`BLUETOOTH_SCAN` sin derivar ubicación, `BLUETOOTH_CONNECT`; en Android 11 o anterior Android exige además el permiso de ubicación para escanear) y vibración (aviso de alineación).
- **Mapa estándar:** igual que en iOS (teselas de `tile.openstreetmap.org`, caché local de hasta 500 MB).
- **Mapa satélite:** imágenes Sentinel-2 cloudless 2016 de EOX (`tiles.maps.eox.at`, CC BY 4.0) y calles y rótulos vectoriales de OpenFreeMap (`tiles.openfreemap.org`, datos de OpenStreetMap). Esas peticiones incluyen las coordenadas de la tesela y tu dirección IP; se rigen por las políticas de sus operadores.
- **Servicios de Google Play:** la ubicación fusionada y la orientación del dispositivo las calcula Google Play Services en el propio teléfono; la app no envía esos datos a ningún servidor.
- **Ficha «Seguridad de los datos» de Google Play:** no se recopilan datos, no se comparten datos con terceros, sin cifrado en tránsito propio porque la app no transmite datos de usuario; las únicas conexiones de red son las descargas de teselas del mapa. Equivale a `PrivacyInfo.xcprivacy` (sin rastreo, sin datos recopilados).

## Tus controles
- Puedes revocar el permiso de ubicación en los ajustes del sistema (Ajustes de iOS o permisos de la app en Android); sin él la app no calcula el azimut. Puedes revocar el de Bluetooth; sin él no se conecta al pinger.
- Las sesiones de medición se guardan solo en tu teléfono; se borran al desinstalar la app.
- Desinstalar la app borra todos los datos locales.

## Contacto
HJ7RMN — <https://github.com/120m4n>
