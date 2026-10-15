# Compilar la APK e instalarla en el teléfono (línea de comandos)

Todos los comandos se ejecutan desde `android-rn/` salvo que se indique otra cosa.

## 1. Requisitos (una sola vez)

- **JDK 17** (`/usr/libexec/java_home -v 17` debe devolver una ruta).
- **Android SDK** (command-line tools) con: `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`.
  En macOS con Homebrew queda en `/opt/homebrew/share/android-commandlinetools`.
- **Node** y las dependencias instaladas: `npm install`.

Variables de entorno (en cada terminal nueva):

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

## 2. Generar el proyecto nativo (solo si no existe `android/`)

`android/` está en `.gitignore`, así que hay que regenerarlo en un clon limpio:

```bash
./node_modules/.bin/expo prebuild --platform android --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

## 3. Compilar la APK de release

```bash
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

- `-PreactNativeArchitectures=arm64-v8a` compila solo para ARM de 64 bits (la mayoría de teléfonos); es mucho más rápido que compilar las cuatro arquitecturas.
- Resultado: `android/app/build/outputs/apk/release/app-release.apk`.
- Para una compilación limpia: `./gradlew clean` antes de `assembleRelease`.

## 4. Preparar el teléfono (una sola vez)

1. Ajustes → Acerca del teléfono → pulsar 7 veces «Versión» (o «Versión de MIUI») para activar opciones de desarrollador.
2. Opciones de desarrollador → activar **Depuración USB**.
   En Xiaomi/Redmi activar además **Instalar vía USB** (puede pedir iniciar sesión en la cuenta Mi).
3. Conectar por USB y aceptar en el teléfono el aviso «¿Permitir depuración USB?».

## 5. Instalar

```bash
$ANDROID_HOME/platform-tools/adb devices          # debe aparecer el dispositivo como "device"
$ANDROID_HOME/platform-tools/adb install -r android/app/build/outputs/apk/release/app-release.apk
```

- `-r` reinstala conservando los datos de la app.
- Si hay varios dispositivos conectados, añade `-s <id>` después de `adb`.
- En Xiaomi la instalación puede quedarse esperando una confirmación en la pantalla del teléfono: acéptala. Si se cuelga el terminal, lánzalo en segundo plano (`... &`).
- Si falla por firma distinta: `adb uninstall co.electrosoftware.meshazimuth` y vuelve a instalar (se pierden los datos de la app).

## 6. Abrir la app y ver el registro

```bash
adb shell monkey -p co.electrosoftware.meshazimuth -c android.intent.category.LAUNCHER 1
adb logcat --pid=$(adb shell pidof co.electrosoftware.meshazimuth)
```

Los CSV del registrador de diagnóstico quedan en
`/sdcard/Android/data/co.electrosoftware.meshazimuth/files/` y se descargan con:

```bash
adb pull /sdcard/Android/data/co.electrosoftware.meshazimuth/files/ ./diag
```

## 7. Comprobaciones antes de compilar (opcional)

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src
./node_modules/.bin/jest
```

## Problemas habituales

| Síntoma | Solución |
|---|---|
| `SDK location not found` | Crear `android/local.properties` con `sdk.dir=$ANDROID_HOME`. |
| Error de versión de Java | Verificar `JAVA_HOME` apunta a JDK 17. |
| `play-services-location` pide Kotlin 2.3 | Mantener la versión fijada en 21.3.0. |
| `adb devices` lista `unauthorized` | Aceptar el aviso de depuración USB en el teléfono. |
| `adb devices` vacío | Cambiar de cable/puerto, modo «Transferencia de archivos», reiniciar con `adb kill-server && adb start-server`. |
