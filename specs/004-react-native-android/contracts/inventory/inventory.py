#!/usr/bin/env python3
"""Regenera los inventarios de la app de referencia (spec 004, ui-spec.md).

Uso (desde la raíz del repo):
    python3 specs/004-react-native-android/contracts/inventory/inventory.py

Escribe strings.tsv, symbols.tsv, fonts.tsv y keys.tsv junto a este script.
Solo lee MeshAzimuth/**/*.swift; no modifica nada más.
"""
import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sorted(glob.glob("MeshAzimuth/**/*.swift", recursive=True))
if not SRC:
    raise SystemExit("ejecutar desde la raíz del repo (no encuentro MeshAzimuth/)")

LIT = re.compile(r'"((?:[^"\\]|\\.)*)"')
HAS_TEXT = re.compile(r"[A-Za-zÁÉÍÓÚáéíóúñÑ±°↑↓Δ]")
DOTTED = re.compile(r"^[a-z0-9]+(\.[a-z0-9]+)+$")
FONT = re.compile(r"\.font\((.+?)\)(?=\s*(?:\.|$|\}|\)))")
KEY = re.compile(r'(?:forKey:|AppStorage\(|Key\s*=|key\s*=)\s*"([^"]+)"')
# Símbolos SF: los que aparecen como systemImage:/systemName: o como literal en una vista/ícono.
SYMBOL_CTX = re.compile(r"systemImage|systemName|icon|Image\(|case \.|\? \"|: \"")
NOT_SYMBOLS = {  # literales con puntos que no son símbolos (claves, colas)
    "boom.offset", "location.last", "map.camera", "map.satellite", "onboarding.done",
    "pinger.simulated", "pinger.lastDevice", "repeaters.selected", "repeaters.v1",
    "list.sortByDistance", "co.electrosoftware.meshazimuth.ble",
}
PLAIN_SYMBOLS = {"checkmark", "location", "map", "pencil", "plus", "scope", "textformat", "trash", "waveform"}

strings, fonts, keys = [], [], []
symbols: dict[str, list[str]] = {}
for f in SRC:
    for n, line in enumerate(open(f, encoding="utf-8"), 1):
        if line.strip().startswith("//"):
            continue
        for m in LIT.finditer(line):
            t = m.group(1)
            if t and HAS_TEXT.search(t):
                strings.append((f, n, t))
            if (DOTTED.match(t) and t not in NOT_SYMBOLS) or (t in PLAIN_SYMBOLS and SYMBOL_CTX.search(line)):
                symbols.setdefault(t, []).append(f"{f}:{n}")
        for m in FONT.finditer(line):
            fonts.append((f, n, m.group(1)))
        for m in KEY.finditer(line):
            keys.append((f, n, m.group(1)))


def write(name, header, rows):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as out:
        out.write(header + "\n")
        for r in rows:
            out.write("\t".join(map(str, r)) + "\n")


write("strings.tsv", "file\tline\tliteral", strings)
write("fonts.tsv", "file\tline\tfont", fonts)
write("keys.tsv", "file\tline\tkey", keys)
write("symbols.tsv", "sf_symbol\toccurrences(file:line)",
      [(s, " ".join(sorted(set(o)))) for s, o in sorted(symbols.items())])
print(f"strings={len(strings)} symbols={len(symbols)} fonts={len(fonts)} keys={len(keys)}")
