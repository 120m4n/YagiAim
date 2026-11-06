#!/bin/sh
# Fixture de la línea M (MEAS, pinger proto=2): la fuente de verdad vive en ping-ponger-meshcore
# (firmware/examples/trace_pinger/tests/fixtures/lines/events_m.txt). Solo se copia ese archivo,
# aparte de los fixtures proto=1 de tools/sync_fixtures.sh (spec 005, research R-7).
#
#   tools/sync_beacon_fixtures.sh            copia (sobrescribe la copia local)
#   tools/sync_beacon_fixtures.sh --check    compara byte a byte; sale con 1 si difieren
#
# ping-ponger-meshcore se busca en $PINGPONGER_DIR (por defecto /Users/120m4n/GitHub/ping-ponger-meshcore).
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="${PINGPONGER_DIR:-/Users/120m4n/GitHub/ping-ponger-meshcore}/firmware/examples/trace_pinger/tests/fixtures/lines/events_m.txt"
DST="$ROOT/MeshAzimuthTests/Fixtures/beacon/events_m.txt"

if [ ! -f "$SRC" ]; then
  echo "no encuentro el fixture: $SRC (define PINGPONGER_DIR)" >&2
  exit 2
fi

case "${1:-}" in
  --check)
    if cmp -s "$SRC" "$DST"; then echo "fixture de baliza sincronizado"
    else echo "events_m.txt difiere del firmware (o falta). Si es intencional: tools/sync_beacon_fixtures.sh" >&2; exit 1; fi
    ;;
  "")
    mkdir -p "$(dirname "$DST")"
    cp "$SRC" "$DST"
    echo "copiado $DST"
    ;;
  *)
    echo "uso: tools/sync_beacon_fixtures.sh [--check]" >&2
    exit 2
    ;;
esac
