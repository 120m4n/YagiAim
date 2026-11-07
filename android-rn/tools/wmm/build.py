"""Genera src/core/wmmData.ts (coeficientes WMM2025, grado 12) y __tests__/goldens/wmm-goldens.json (referencia: pygeomag).
Uso: pip install pygeomag && python3 tools/wmm/build.py"""
import json, os, random, pygeomag
from pygeomag import GeoMag

root = os.path.join(os.path.dirname(__file__), '..', '..')
cof = os.path.join(os.path.dirname(pygeomag.__file__), 'wmm', 'WMM_2025.COF')
lines = open(cof).read().splitlines()
epoch = float(lines[0].split()[0])
rows = []
for l in lines[1:]:
    p = l.split()
    if len(p) == 6 and p[0].isdigit():
        n, m, g, h, gd, hd = int(p[0]), int(p[1]), *map(float, p[2:])
        rows.append([n, m, g, h, gd, hd])
assert len(rows) == 90 and max(r[0] for r in rows) == 12
with open(os.path.join(root, 'src/core/wmmData.ts'), 'w') as f:
    f.write('// GENERADO por tools/wmm/build.py — no editar. World Magnetic Model 2025 (NOAA/NCEI y BGS), dominio público.\n')
    f.write(f'export const WMM_EPOCH = {epoch};\n// [n, m, g, h, gDot, hDot] (nT, nT/año)\nexport const WMM_COEFFICIENTS: readonly (readonly number[])[] = {json.dumps(rows)};\n')

gm = GeoMag(coefficients_file='wmm/WMM_2025.COF')
random.seed(7)
pts = [(7.1, -73.1, 1.0, 2026.79), (3.45, -76.53, 1.0, 2026.79), (4.71, -74.07, 2.6, 2026.0), (0, 0, 0, 2025.0), (89.5, 10, 0, 2027.5), (-89.5, -170, 0, 2027.5),
       (45, 179.9, 0.5, 2028), (-33.9, 151.2, 0, 2029.99), (60, -45, 10, 2025.5)]
pts += [(random.uniform(-85, 85), random.uniform(-180, 180), random.uniform(0, 5), random.uniform(2025, 2030)) for _ in range(40)]
out = []
for lat, lon, alt, t in pts:
    r = gm.calculate(glat=lat, glon=lon, alt=alt, time=t)
    out.append({'lat': lat, 'lon': lon, 'altKm': alt, 'year': t, 'd': r.d, 'i': r.i, 'f': r.f, 'h': r.h, 'x': r.x, 'y': r.y, 'z': r.z})
json.dump(out, open(os.path.join(root, '__tests__/goldens/wmm-goldens.json'), 'w'), indent=1)
print(len(rows), 'coeficientes;', len(out), 'puntos de referencia; época', epoch)
