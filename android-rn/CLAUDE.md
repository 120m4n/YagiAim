# android-rn — notas para Claude

App React Native (Expo SDK 57) de MeshAzimuth. Build en Windows con `tools/build-windows.ps1` (ver `BUILD-WINDOWS.md`).

## Compilar: elige el paso más barato

El coste lo manda `expo prebuild`: **borra `android/` entera, incluidos `build/` y `.cxx/`**, y obliga a recompilar todo el C++ nativo (Hermes, reanimated, Skia, MapLibre…) desde cero. Tarda mucho más que un build incremental.

| Qué cambió | Qué ejecutar |
|---|---|
| Solo JS/TS (pantallas, lógica, tests) | `-Step dev`: Metro con la APK debug, se ve al guardar, sin compilar |
| Release sin cambios nativos | `-Step build` (sin `-Prebuild`): incremental, reutiliza la caché de Gradle |
| Config nativa (`app.json`: splash, permisos, plugins; módulos en `modules/`) | `-Step build -Prebuild`: es el único caso en que se regenera `android/` |

- El script ya **no** borra `android/` ni ejecuta `npm ci` por defecto: `prebuild` solo corre si falta `android\gradlew.bat` o con `-Prebuild`; `npm ci` solo si falta `node_modules`.
- `-Step dev -Native` fuerza reinstalar la parte nativa de la APK debug.
- No lances dos builds a la vez: el segundo falla con `EBUSY` al limpiar `android/`. Antes de `-Prebuild`, comprueba que no haya otro build en curso y ejecuta `android\gradlew.bat --stop`.
- `android/` está en `.gitignore`: nunca edites ahí; la configuración va en `app.json` o en `plugins/`.

## adb y el teléfono

- **Comprueba siempre qué dispositivo está conectado** (`adb devices -l`, `ro.product.model`) antes de instalar o desinstalar nada. En esta sesión cambió el teléfono sin avisar y se desinstalaron apps del equivocado.
- **Git Bash reescribe rutas que empiezan por `/`**: `adb push x /sdcard/Download/...` termina en una ruta falsa (`C:/Program Files/Git/...`). Usa `MSYS_NO_PATHCONV=1` o ejecuta desde PowerShell. Verifica con `adb shell ls -l` el destino.
- **Xiaomi/HyperOS** rechaza `adb install` con `INSTALL_FAILED_USER_RESTRICTED` salvo que estén activos «Instalar vía USB» y «Depuración USB (Ajustes de seguridad)» (pide cuenta Xiaomi; a veces hay que reiniciar). Si no se aplica, deja la APK en `/sdcard/Download/` e instálala a mano desde Archivos. La señal de que falta es `SecurityException … INJECT_EVENTS` al usar `adb shell input`.
- **«No conservar actividades»** (opción de desarrollador): cambiarla con `adb shell settings put` **no** afecta al valor en memoria; hay que hacerlo desde Ajustes. Activada, la app se destruye al abrir el selector de archivos (la importación de JSON se pierde y se ve pantalla blanca y luego el mapa). Señal en logcat: `wm_destroy_activity … always-finish`.
- Para desinstalar apps del sistema usa `pm uninstall --user 0` (reversible con `cmd package install-existing <paquete>`); las de usuario con `pm uninstall`, que borra sus datos.

## Calidad

- `npx tsc --noEmit`, `npx eslint <archivos>` y `npx jest` antes de commitear.
- `__tests__/core/goldens.test.ts` («escapado RFC 4180 como Swift (grafemas)») ya fallaba antes de los cambios recientes y no depende de ellos.
- Commits en español, `tipo(android-rn): resumen`, separados por tema.
