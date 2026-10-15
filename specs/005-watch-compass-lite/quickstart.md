# Quickstart: 005 Brújula lite en Apple Watch Series 3

## Requisitos

- Xcode 26.x (admite watchOS 8 como destino), XcodeGen.
- iPhone con iOS 17+ emparejado con un Apple Watch Series 3 en watchOS 8.8.1, con el modo desarrollador activado en ambos.

## Compilar e instalar

```bash
xcodegen generate
open MeshAzimuth.xcodeproj
```

1. Elige el esquema `MeshAzimuth` y tu iPhone; firma ambos targets con tu equipo.
2. Ejecuta. La app del reloj se instala con la del iPhone (o desde la app Watch del iPhone → MeshAzimuth → Mostrar en el Apple Watch).
3. Para depurar el reloj: esquema `MeshAzimuthWatch` con destino el Series 3.

## Uso en campo

1. iPhone sobre el boom → pantalla de apuntamiento abierta.
2. Abre MeshAzimuth en el reloj. La primera vez explica que la brújula sigue al iPhone, no a la muñeca.
3. Gira la antena mirando el reloj: "Gira N°" con su sentido; al alinear vibra 3 s y se pone verde.
4. Recomendado: en el reloj, Ajustes → General → **Volver al reloj** → ajusta el tiempo para que, al levantar la muñeca, vuelva a MeshAzimuth en lugar de a la esfera. El Series 3 no tiene pantalla siempre activa.

## Tests

```bash
xcodebuild test -scheme MeshAzimuth -destination 'platform=iOS Simulator,name=<simulador>'
```

Incluye `WatchPayloadTests` (contrato de mensajes, emisión, orden, antigüedad).
