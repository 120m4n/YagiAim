# Compilar e instalar la APK en Windows (guía para Claude Code)

Instrucciones para que un agente (Claude Code en Windows) clone el repositorio, instale las herramientas, compile la APK de
release e instale la app en un teléfono Android por USB. Las personas también pueden seguirlas a mano. La guía equivalente
para macOS es `BUILD-ANDROID.md`.

## Reglas para el agente

- **Shell**: Claude Code en Windows ejecuta los comandos en Git Bash. Todo lo de Windows va por PowerShell desde Bash con
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "..."` o `-File <script>`. No uses `export`, `~/`, `sudo` ni
  Homebrew: no aplican.
- **Script**: los pasos 2 a 4 los hace `android-rn\tools\build-windows.ps1 -Step <paso>`. Ejecuta un paso cada vez y
  comprueba que la salida termina en `OK <paso>` antes de seguir. Si lanza un error, ve a «Problemas» y no repitas el
  mismo comando más de dos veces.
- **Antes de instalar software** (paso 2: Node, JDK 17, Android SDK con winget y descargas de Google), pide confirmación al
  usuario: cambia su sistema y descarga unos 4 GB.
- **Lo que solo hace el usuario**: activar la depuración USB, aceptar el aviso «¿Permitir depuración USB?» y aceptar la
  instalación en la pantalla del teléfono. Cuando haga falta, díselo y espera.
- **Tiempos**: el primer `-Step tools` tarda de 5 a 15 min y el primer `-Step build`, de 10 a 25 min. Ejecútalos con un
  tiempo de espera de 30 min o en segundo plano.
- **No hagas** `git push`, no borres `~\.gradle` ni el SDK y no cambies la versión de `play-services-location` (21.3.0)
  sin preguntar.

## Requisitos

| Requisito | Comprobación |
| --- | --- |
| Windows 10/11 de 64 bits con `winget` | `powershell.exe -NoProfile -Command "winget --version"` |
| Git para Windows (Claude Code ya lo necesita) | `git --version` |
| 15 GB libres en el disco del repositorio | `powershell.exe -NoProfile -Command "Get-PSDrive C"` (columna `Free`) |
| Teléfono Android 8.0 (API 26) o superior, con brújula y cable USB de datos | — |

## 1. Clonar el repositorio en la rama de android-rn

El código Android vive en `android-rn/` dentro de la rama `004-react-native-android`. Clona en una ruta corta y sin
espacios: el NDK y CMake fallan con rutas largas o con espacios.

```bash
git config --global core.longpaths true
cd "$USERPROFILE"
git clone --branch 004-react-native-android https://github.com/120m4n/YagiAim.git MeshAzimuth
cd MeshAzimuth
git branch --show-current     # esperado: 004-react-native-android
ls android-rn/tools/build-windows.ps1
```

Si el repositorio ya existe: `git -C "$USERPROFILE/MeshAzimuth" fetch origin`, luego `git checkout
004-react-native-android` y `git pull --ff-only`. Si `pull` falla por cambios locales, pregunta al usuario; no los descartes.

Todos los comandos siguientes se ejecutan desde la raíz del repositorio (`$USERPROFILE/MeshAzimuth`).

## 2. Instalar el JDK y las demás herramientas

Pide confirmación antes (ver «Reglas»).

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File android-rn/tools/build-windows.ps1 -Step tools
```

Qué instala, solo si falta:

| Herramienta | Versión | Origen |
| --- | --- | --- |
| Node.js | LTS | `winget install OpenJS.NodeJS.LTS` |
| JDK | 17 (Microsoft OpenJDK) | `winget install Microsoft.OpenJDK.17` |
| Android command-line tools | `latest` | zip de `dl.google.com`, en `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest` |
| Paquetes del SDK | `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1` | `sdkmanager` |

También acepta las licencias del SDK y guarda `JAVA_HOME`, `ANDROID_HOME` y el `Path` en las variables del usuario.

**Resultado esperado**: una línea `openjdk version "17...`, la versión de Node, `Android Debug Bridge version ...` y
`OK tools`.

Las variables nuevas no llegan a la Git Bash que ya está abierta. El script las vuelve a cargar en cada paso, así que no
hace falta reiniciar. Para usar `adb` o `java` directamente, usa la ruta completa o reinicia Claude Code.

## 3. Compilar la APK

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File android-rn/tools/build-windows.ps1 -Step build
```

Hace `npm ci`, `npx expo prebuild --platform android --no-install` (genera `android-rn/android/`, que está en
`.gitignore`), escribe `android/local.properties` con `sdk.dir` y ejecuta `gradlew.bat assembleRelease
-PreactNativeArchitectures=arm64-v8a`. Compila solo para ARM de 64 bits, que cubre casi todos los teléfonos.

**Resultado esperado**: la ruta de `android-rn\android\app\build\outputs\apk\release\app-release.apk` (unos 60 MB) y
`OK build`. La APK va firmada con la clave de depuración de Expo: vale para instalarla por USB, no para Google Play.

Si `app.json` o algo de `android-rn/plugins/` cambió, vuelve a ejecutar este paso: el `prebuild` regenera el proyecto
nativo.

## 4. Instalar la APK en el teléfono

Primero, el usuario prepara el teléfono (una sola vez). Pásale estas instrucciones:

1. Ajustes → Acerca del teléfono → pulsar 7 veces «Versión» (en Xiaomi, «Versión de HyperOS/MIUI»).
2. Ajustes → Opciones de desarrollador → activar **Depuración USB**. En Xiaomi/Redmi, activar también **Instalar vía
   USB** (puede pedir la cuenta Mi y una SIM).
3. Conectar el cable, elegir «Transferencia de archivos» y aceptar «¿Permitir depuración USB?».

Después:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File android-rn/tools/build-windows.ps1 -Step install
```

Comprueba que hay un teléfono en estado `device`, ejecuta `adb install -r` (conserva los datos de la app) y abre la app.
En Xiaomi, `adb install` espera a que el usuario acepte la instalación en la pantalla: avísale en cuanto lances el paso.

**Resultado esperado**: `Success`, `OK install` y la app abierta en el teléfono.

## Problemas

| Síntoma | Causa | Qué hacer |
| --- | --- | --- |
| `winget` no existe | Windows sin App Installer | Pedir al usuario que instale «App Installer» desde Microsoft Store. |
| `running scripts is disabled` | Directiva de ejecución | Invocar siempre con `-ExecutionPolicy Bypass`, como arriba. |
| `Invoke-WebRequest` 404 en `commandlinetools-win-...zip` | Google publicó otra versión | Buscar el nombre vigente en developer.android.com/studio («Command line tools only», Windows), cambiar `$cltZip` en el script y repetir `-Step tools`. |
| `No hay JDK 17` | Falta el paso 2 o falló winget | Repetir `-Step tools`; comprobar `C:\Program Files\Microsoft\jdk-17*`. |
| `Solo hay N GB libres` o `No space left on device` | Disco lleno | Pedir al usuario que libere espacio (10 GB como mínimo). No borres cachés sin preguntar. |
| `Filename longer than 260 characters` | Rutas largas | `git config --global core.longpaths true` y clonar en una ruta más corta. |
| `SDK location not found` | Falta `local.properties` | Repetir `-Step build` (lo vuelve a escribir). |
| `Unsupported class file major version` o un error de Java en Gradle | `JAVA_HOME` no es el 17 | El script fija el 17 en la sesión; si persiste, revisar `[Environment]::GetEnvironmentVariable('JAVA_HOME','User')`. |
| `play-services-location` pide Kotlin 2.3 | Versión de la dependencia | Mantenerla en 21.3.0. |
| `No hay ningún teléfono en estado "device"` | Sin depuración USB, sin autorizar o sin controlador | Ver la tabla siguiente. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | La instalada tiene otra firma | Preguntar al usuario: la solución, `adb uninstall co.electrosoftware.meshazimuth`, borra los datos de la app. |
| `INSTALL_FAILED_USER_RESTRICTED` | Xiaomi sin «Instalar vía USB», o se rechazó el aviso | Activarlo y repetir `-Step install`. |

Estados de `adb devices` (el `adb` está en `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`):

| Estado | Qué hacer |
| --- | --- |
| Lista vacía | Cable de datos, modo «Transferencia de archivos», otro puerto. Si Windows no reconoce el teléfono: `sdkmanager "extras;google;usb_driver"`, y el usuario asigna ese controlador en el Administrador de dispositivos (`devmgmt.msc`). |
| `unauthorized` | Aceptar «¿Permitir depuración USB?» en el teléfono; si no aparece, `adb kill-server` y `adb start-server`. |
| `offline` | Desconectar y volver a conectar el cable. |

## Registro y diagnóstico (opcional)

```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$ADB" logcat --pid="$("$ADB" shell pidof co.electrosoftware.meshazimuth | tr -d '\r')"
"$ADB" pull /sdcard/Android/data/co.electrosoftware.meshazimuth/files/ ./diag
```

Las líneas `MA_CAL` del logcat muestran el estado de la calibración de la brújula (`cal`, `cob`, `rms`, `prec`).
