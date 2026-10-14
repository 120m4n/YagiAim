#!/bin/sh
# Fixtures de líneas del pinger: la fuente de verdad vive en el repo Meshcore
# (examples/trace_pinger/tests/fixtures/lines). Esta app guarda una copia en
# MeshAzimuthTests/Fixtures/lines para poder construirse sin ese repo (spec 003, research R-8).
#
#   tools/sync_fixtures.sh            copia desde Meshcore (sobrescribe la copia local)
#   tools/sync_fixtures.sh --check    compara byte a byte; sale con 1 si difieren
#
# Meshcore se busca en $MESHCORE_DIR (por defecto /Users/120m4n/GitHub/Meshcore).
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="${MESHCORE_DIR:-/Users/120m4n/GitHub/Meshcore}/examples/trace_pinger/tests/fixtures/lines"
DST="$ROOT/MeshAzimuthTests/Fixtures/lines"

if [ ! -d "$SRC" ]; then
  echo "no encuentro los fixtures de Meshcore: $SRC (define MESHCORE_DIR)" >&2
  exit 2
fi

case "${1:-}" in
  --check)
    if [ ! -d "$DST" ]; then
      echo "falta $DST: ejecuta tools/sync_fixtures.sh" >&2
      exit 1
    fi
    if diff -r "$SRC" "$DST"; then
      echo "fixtures sincronizados ($(ls "$DST" | wc -l | tr -d ' ') archivos)"
    else
      echo >&2
      echo "los fixtures de la app difieren de los de Meshcore. Si el cambio es intencional: tools/sync_fixtures.sh" >&2
      exit 1
    fi
    ;;
  "")
    mkdir -p "$DST"
    rm -f "$DST"/*.txt
    cp "$SRC"/*.txt "$DST"/
    echo "copiados $(ls "$DST" | wc -l | tr -d ' ') archivos a $DST"
    ;;
  *)
    echo "uso: tools/sync_fixtures.sh [--check]" >&2
    exit 2
    ;;
esac
