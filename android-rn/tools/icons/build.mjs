// PM-25 / C-1 — los 33 símbolos de contracts/inventory/symbols.tsv como glifos propios sobre la base de Lucide (ISC).
// No se calca ni deriva de los SF Symbols: cada símbolo se resuelve a uno o dos glifos de Lucide.
// Uso: node tools/icons/build.mjs  →  src/ui/icons/glyphs.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// mode: undefined = solo trazo | 'fill' = relleno con el color | 'cutout' = primer glifo relleno y el resto en el color de fondo
const DEFS = {
  'antenna.radiowaves.left.and.right': { parts: ['radio-tower'] },
  'arrow.clockwise': { parts: ['rotate-cw'] },
  'arrow.counterclockwise': { parts: ['rotate-ccw'] },
  'checkmark': { parts: ['check'] },
  'checkmark.circle.fill': { parts: ['circle', 'check'], mode: 'cutout' },
  'chevron.left.forwardslash.chevron.right': { parts: ['code'] },
  'chevron.right': { parts: ['chevron-right'] },
  'ellipsis.circle': { parts: ['circle', 'ellipsis'] },
  'exclamationmark.triangle': { parts: ['triangle-alert'] },
  'exclamationmark.triangle.fill': { parts: ['triangle-alert'], mode: 'fill' },
  'globe.americas': { parts: ['earth'] },
  'info.circle': { parts: ['info'] },
  'iphone.gen3': { parts: ['smartphone'] },
  'list.bullet': { parts: ['list'] },
  'list.bullet.rectangle': { parts: ['clipboard-list'] },
  'location': { parts: ['navigation'] },
  'location.fill': { parts: ['navigation'], mode: 'fill' },
  'location.north.line': { parts: ['navigation-2'] },
  'location.north.line.fill': { parts: ['navigation-2'], mode: 'fill' },
  'location.slash': { parts: ['navigation-off'] },
  'map': { parts: ['map'] },
  'mappin.and.ellipse': { parts: ['map-pin'] },
  'pencil': { parts: ['pencil'] },
  'plus': { parts: ['plus'] },
  'questionmark.circle': { parts: ['circle-question-mark'] },
  'scope': { parts: ['crosshair'] },
  'square.and.arrow.down': { parts: ['download'] },
  'square.and.arrow.up': { parts: ['share'] },
  'textformat': { parts: ['type'] },
  'trash': { parts: ['trash-2'] },
  'wand.and.stars': { parts: ['wand-sparkles'] },
  'waveform': { parts: ['audio-waveform'] },
  'wifi.slash': { parts: ['wifi-off'] },
};

// Glifos de los controles del sistema (búsqueda, atrás, borrar texto): no están en el inventario de 33 símbolos de la app.
const EXTRA = { 'magnifyingglass': ['search'], 'chevron.left': ['chevron-left'], 'xmark.circle.fill': ['circle-x'] };

const expected = readFileSync(new URL('../../../specs/004-react-native-android/contracts/inventory/symbols.tsv', import.meta.url), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((l) => l.split('\t')[0]);
const missing = expected.filter((n) => !(n in DEFS));
if (missing.length || Object.keys(DEFS).length !== expected.length) throw new Error(`símbolos sin definir: ${missing}`);

const nodeRe = /<(path|circle|line|rect|polyline|polygon|ellipse)\s+([^>]*?)\/>/g;
const attrRe = /([a-zA-Z-]+)="([^"]*)"/g;
const out = {};
for (const [name, def] of [...Object.entries(DEFS), ...Object.entries(EXTRA).map(([n, parts]) => [n, { parts, ...(n === 'xmark.circle.fill' ? { mode: 'fill' } : {}) }])]) {
  const parts = def.parts.map((p) => {
    const file = new URL(`../../node_modules/lucide-static/icons/${p}.svg`, import.meta.url);
    if (!existsSync(file)) throw new Error(`falta el glifo de Lucide: ${p}`);
    const svg = readFileSync(file, 'utf8');
    return [...svg.matchAll(nodeRe)].map((m) => ({ tag: m[1], attrs: Object.fromEntries([...m[2].matchAll(attrRe)].map((a) => [a[1], a[2]])) }));
  });
  out[name] = { parts, ...(def.mode ? { mode: def.mode } : {}) };
}
writeFileSync(
  new URL('../../src/ui/icons/glyphs.ts', import.meta.url),
  `// GENERADO por tools/icons/build.mjs — no editar. Glifos de Lucide (ISC), ver NOTICE.\nexport type GlyphNode = { tag: 'path' | 'circle' | 'line' | 'rect' | 'polyline' | 'polygon' | 'ellipse'; attrs: Record<string, string> };\nexport interface Glyph { parts: GlyphNode[][]; mode?: 'fill' | 'cutout' }\nexport const glyphs: Record<string, Glyph> = ${JSON.stringify(out, null, 1)};\n`,
);
console.log(`${Object.keys(out).length} glifos`);
