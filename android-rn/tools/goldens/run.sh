#!/usr/bin/env bash
# T010/T011 — compila tools/goldens/main.swift JUNTO a los archivos Swift de la referencia (sin modificarlos) y
# regenera __tests__/goldens/swift-goldens.json. Solo macOS. Fija la referencia: 120m4n/YagiAim@2eda6d9.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
REF=2eda6d9

# La referencia debe estar intacta respecto al commit fijado (plan.md): si cambió, hay que revisar la matriz de paridad.
if ! git diff --quiet "$REF" -- MeshAzimuth MeshAzimuthTests; then
  echo "AVISO: MeshAzimuth/ o MeshAzimuthTests/ difieren de $REF; los dorados ya no corresponden al commit fijado." >&2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
swiftc -O -swift-version 5 \
  MeshAzimuth/Geo.swift MeshAzimuth/AimInfo.swift MeshAzimuth/RepeaterStore.swift \
  MeshAzimuth/Link/LineCodec.swift MeshAzimuth/Link/LineTransport.swift MeshAzimuth/Link/PingerLink.swift \
  MeshAzimuth/Link/SimulatedPinger.swift MeshAzimuth/Session/SessionModels.swift MeshAzimuth/Session/SessionCSV.swift MeshAzimuth/Session/SessionStore.swift \
  android-rn/tools/goldens/main.swift -o "$TMP/goldens"

"$TMP/goldens" > "$TMP/base.json"
for loc in es_CO en_US; do
  "$TMP/goldens" -AppleLanguages "(${loc%%_*})" -AppleLocale "$loc" --locale="$loc" > "$TMP/$loc.json"
done

mkdir -p android-rn/__tests__/goldens
node -e '
const fs = require("fs");
const t = process.argv[1];
const g = JSON.parse(fs.readFileSync(t + "/base.json", "utf8"));
g.locale = {};
for (const l of ["es_CO", "en_US"]) Object.assign(g.locale, JSON.parse(fs.readFileSync(`${t}/${l}.json`, "utf8")).locale);
g.reference = process.argv[2];
fs.writeFileSync(process.argv[3], JSON.stringify(g, null, 1) + "\n");
' "$TMP" "$REF" android-rn/__tests__/goldens/swift-goldens.json
echo "OK: android-rn/__tests__/goldens/swift-goldens.json"
