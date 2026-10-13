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
cd YagiAim
xcodegen generate
open YagiAim.xcodeproj
```

Selecciona tu equipo de firma y ejecútalo en un iPhone físico (el simulador no tiene magnetómetro). `⌘U` corre las pruebas de geodesia.

## Uso en campo

1. Calibra la brújula moviendo el teléfono en forma de ocho si la precisión pasa de ±15°.
2. Coloca el teléfono plano sobre el boom, borde superior hacia el director.
3. Aléjalo de mástiles metálicos, el coaxial y el imán del rotor: desvían el magnetómetro varios grados.
4. Con el haz de una Yagi de 3 elementos (~60–70° a −3 dB), ±3° es más que suficiente; ajusta el último tramo por RSSI/SNR del companion.

## Estructura

| Archivo | Rol |
|---|---|
| `Geo.swift` | Azimut, haversine, elevación, delta con signo |
| `LocationManager.swift` | GPS + rumbo verdadero suavizado, última ubicación persistida |
| `MapView.swift` | MKMapView con teselas OSM en caché, anotaciones y toques |
| `NetworkMonitor.swift` | Estado de conectividad (aviso sin red) |
| `RepeaterStore.swift` | Repetidores persistidos en UserDefaults |
| `CompassView.swift` | Brújula SwiftUI |
| `Haptics.swift` | Vibración sostenida (3 s) al alinear, con Core Haptics |
| `ContentView.swift` | Mapa, panel inferior, pantalla de apuntamiento, editor |
