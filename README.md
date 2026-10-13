# MeshAzimuth

MeshAzimuth (antes YagiAim) es una app iOS (SwiftUI, iOS 17+) para orientar una antena Yagi-Uda hacia un repetidor MeshCore.

- Toca el mapa (satélite/estándar) para marcar el repetidor; se guardan varios con nombre y altitud opcional.
- Calcula **azimut verdadero** (círculo máximo), distancia y, si das la altitud, **elevación** con corrección de curvatura k = 4/3.
- Brújula: el dial gira con el teléfono, el triángulo superior es el boom de la Yagi y la aguja naranja apunta al repetidor. Se pone verde y vibra 3 s (continua + golpes) al quedar dentro de la tolerancia (±1–15°, por defecto ±3°).
- Usa `CLHeading.trueHeading`, que ya corrige la declinación magnética (unos −6° en Colombia). Sin fix GPS cae a norte magnético y lo avisa.
- El rumbo se suaviza con media exponencial sobre sin/cos para evitar el salto 359°→0°.

## Persistencia entre reinicios

- Se conservan: repetidores y selección, tolerancia, estilo del mapa (satélite/estándar) y la última región vista.
- Se guarda la última ubicación: al abrir, azimut y distancia aparecen al instante con la etiqueta «ubicación anterior» hasta que llega un fix GPS nuevo.
- Sin red se muestra un aviso. El mapa estándar usa teselas OSM con caché pasiva en disco (hasta 500 MB): solo queda guardado lo que se ha visto, así que recorre la zona con red antes de ir a campo. El satélite (Apple) requiere conexión.

## Compilar

```bash
brew install xcodegen
cd <carpeta-del-repositorio>
xcodegen generate
open MeshAzimuth.xcodeproj
```

Selecciona tu equipo de firma y ejecútalo en un iPhone físico (el simulador no tiene magnetómetro). `⌘U` corre las pruebas de geodesia.

## Uso en campo

1. Calibra la brújula moviendo el teléfono en forma de ocho si la precisión pasa de ±15°.
2. Coloca el teléfono plano sobre el boom, borde superior hacia el director.
3. Aléjalo de mástiles metálicos, el coaxial y el imán del rotor: desvían el magnetómetro varios grados.
4. Con el haz de una Yagi de 3 elementos (~60–70° a −3 dB), ±3° es más que suficiente; ajusta el último tramo por RSSI/SNR del companion.

## Funciones

- **Alineación con histéresis:** entra a ±tolerancia y sale a ±(tolerancia + 2°); vibra 3 s al alinear.
- **Calibración del boom:** corrige la desalineación teléfono–boom apuntando la Yagi a un objetivo conocido.
- **Inclinación:** con Core Motion compara el pitch del boom con la elevación calculada («Sube/Baja X°»).
- **Repetidores:** búsqueda, orden por cercanía, distancia y azimut por fila, importar/exportar JSON.
- **Mapa:** teselas OSM con caché pasiva (se gestiona en *Acerca de*) o satélite de Apple.
- **Guía de uso** en el primer arranque y aviso cuando el permiso de ubicación está denegado.

Ver [PRIVACY.md](PRIVACY.md) para la política de privacidad.

## Estructura

| Archivo | Rol |
|---|---|
| `MeshAzimuthApp.swift` | Punto de entrada e inyección de dependencias |
| `ContentView.swift` | Mapa y panel inferior |
| `AimView.swift` / `AimInfo.swift` | Pantalla de apuntamiento y cálculo de azimut/distancia/elevación |
| `RepeaterViews.swift` | Lista (búsqueda, orden, import/export) y editor de repetidores |
| `RepeaterStore.swift` | Repetidores persistidos en UserDefaults |
| `CompassView.swift` | Brújula SwiftUI con histéresis y háptica |
| `Haptics.swift` | Vibración sostenida (3 s) con Core Haptics |
| `LocationManager.swift` | GPS, rumbo verdadero suavizado, offset de calibración, última ubicación |
| `MotionManager.swift` | Inclinación del boom (Core Motion) |
| `MapView.swift` | MKMapView con teselas OSM en caché, anotaciones y toques |
| `NetworkMonitor.swift` / `PermissionBanner.swift` | Aviso sin red / sin permiso de ubicación |
| `AboutView.swift` / `OnboardingView.swift` | Acerca de (versión, caché, desarrollador) y guía de uso |
| `Theme.swift` | Paleta de colores |
| `Geo.swift` | Azimut, haversine, elevación, delta con signo, histéresis |
| `PrivacyInfo.xcprivacy` | Manifiesto de privacidad de Apple |
| `design/` | Logo original y capturas de referencia |
