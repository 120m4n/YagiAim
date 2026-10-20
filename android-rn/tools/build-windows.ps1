# Compila e instala la APK de MeshAzimuth en Windows. Ver android-rn/BUILD-WINDOWS.md.
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File android-rn\tools\build-windows.ps1 -Step <tools|build|install|all>
# Cada paso termina con "OK <paso>" o lanza un error con la causa. Se puede repetir: salta lo que ya está instalado.
param([ValidateSet('tools', 'build', 'install', 'all')][string]$Step = 'all')
$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\.."            # android-rn
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
# Nombre del zip vigente: developer.android.com/studio → "Command line tools only" → Windows
$cltZip = 'commandlinetools-win-13114758_latest.zip'
$sdkPackages = 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0', 'ndk;27.1.12297006', 'cmake;3.22.1'
$apk = "$root\android\app\build\outputs\apk\release\app-release.apk"
$package = 'co.electrosoftware.meshazimuth'

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Exec([scriptblock]$cmd, [string]$what) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "Falló: $what (código $LASTEXITCODE)" }
}

function Find-Jdk17 {
  Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}

# Variables para esta sesión (las permanentes las escribe Install-Tools).
function Use-Env {
  Refresh-Path
  $jdk = Find-Jdk17
  if (-not $jdk) { throw 'No hay JDK 17: ejecuta -Step tools' }
  $env:JAVA_HOME = $jdk
  $env:ANDROID_HOME = $sdk
  $env:Path = "$jdk\bin;$sdk\cmdline-tools\latest\bin;$sdk\platform-tools;$env:Path"
}

function Install-Tools {
  $winget = @('-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements')
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Exec { winget install --id OpenJS.NodeJS.LTS @winget } 'instalar Node LTS' }
  if (-not (Find-Jdk17)) { Exec { winget install --id Microsoft.OpenJDK.17 @winget } 'instalar JDK 17' }

  if (-not (Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
    $tmp = "$env:TEMP\cltools"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
    Invoke-WebRequest "https://dl.google.com/android/repository/$cltZip" -OutFile "$env:TEMP\$cltZip"
    Expand-Archive "$env:TEMP\$cltZip" -DestinationPath $tmp -Force
    Move-Item "$tmp\cmdline-tools" "$sdk\cmdline-tools\latest"
  }

  Use-Env
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $env:JAVA_HOME, 'User')
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  foreach ($p in "$sdk\cmdline-tools\latest\bin", "$sdk\platform-tools") {
    if ($userPath -notlike "*$p*") { $userPath = "$userPath;$p" }
  }
  [Environment]::SetEnvironmentVariable('Path', $userPath, 'User')

  1..30 | ForEach-Object { 'y' } | sdkmanager.bat --licenses | Out-Null
  Exec { sdkmanager.bat @sdkPackages } 'instalar paquetes del SDK'

  java -version 2>&1 | Select-Object -First 1
  node -v
  adb version | Select-Object -First 1
  Write-Host 'OK tools'
}

function Build-Apk {
  Use-Env
  $free = [math]::Round((Get-PSDrive ($root.Path.Substring(0, 1))).Free / 1GB, 1)
  if ($free -lt 10) { throw "Solo hay $free GB libres; el build necesita unos 10 GB" }

  Set-Location $root
  Exec { npm ci } 'npm ci'
  Exec { npx expo prebuild --platform android --no-install } 'expo prebuild'
  "sdk.dir=$($sdk -replace '\\', '/')" | Set-Content -Encoding ascii "$root\android\local.properties"
  Set-Location "$root\android"
  Exec { .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a } 'gradlew assembleRelease'
  Get-Item $apk | Select-Object FullName, Length, LastWriteTime
  Write-Host 'OK build'
}

function Install-Apk {
  Use-Env
  if (-not (Test-Path $apk)) { throw "No existe ${apk}: ejecuta -Step build" }
  $devices = adb devices | Select-String "`tdevice$"
  if (-not $devices) {
    adb devices
    throw 'No hay ningún teléfono en estado "device" (ver BUILD-WINDOWS.md, paso 4)'
  }
  Write-Host 'Instalando: si se queda esperando, acepta la instalación en la pantalla del teléfono.'
  $out = adb install -r $apk 2>&1 | Out-String
  Write-Host $out
  if ($out -notmatch 'Success') { throw "adb install no devolvió Success" }
  adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host 'OK install'
}

switch ($Step) {
  'tools' { Install-Tools }
  'build' { Build-Apk }
  'install' { Install-Apk }
  'all' { Install-Tools; Build-Apk; Install-Apk }
}
