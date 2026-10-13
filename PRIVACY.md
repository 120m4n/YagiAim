# Política de privacidad — MeshAzimuth

Última actualización: 2026-10-13

MeshAzimuth no tiene cuentas, no usa analítica ni publicidad, y no envía tus datos a servidores del desarrollador.

## Qué datos usa la app
- **Ubicación precisa (GPS)** y **brújula**: se usan solo en el dispositivo para calcular azimut, distancia y elevación hacia el repetidor. No se transmiten ni se comparten.
- **Repetidores, preferencias, última ubicación y región del mapa**: se guardan localmente en el dispositivo (`UserDefaults`). Si exportas la lista de repetidores, el archivo lo compartes tú, de forma manual.
- **Sensores de movimiento**: se usan en pantalla de apuntamiento para medir la inclinación; no se guardan.

## Conexiones de red
- **Mapa estándar:** la app descarga teselas de `tile.openstreetmap.org` (OpenStreetMap Foundation). Esa petición incluye las coordenadas de la tesela y tu dirección IP; se rige por la [política de privacidad de OSMF](https://osmfoundation.org/wiki/Privacy_Policy). Las teselas vistas se guardan en caché local (hasta 500 MB) y puedes borrarlas desde *Acerca de*.
- **Mapa satélite:** lo proporciona Apple Maps (MapKit) y se rige por la política de Apple.

## Tus controles
- Puedes revocar el permiso de ubicación en Ajustes de iOS; sin él la app no calcula el azimut.
- Desinstalar la app borra todos los datos locales.

## Contacto
HJ7RMN — <https://github.com/120m4n>
