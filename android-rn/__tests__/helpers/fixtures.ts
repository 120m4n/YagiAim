// Los fixtures se leen directamente de MeshAzimuthTests/Fixtures/lines (FR-007): sin copia.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../../../MeshAzimuthTests/Fixtures/lines');

export interface Fixture { line: string; json: Record<string, unknown>; where: string }

export function loadFixtures(name: string): Fixture[] {
  const out: Fixture[] = [];
  readFileSync(join(DIR, name), 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.replace(/^\r+|\r+$/g, '');
    const t = line.replace(/^[ \t]+|[ \t]+$/g, '');
    // Comentario: "#" solo o "# texto". "#HELLO", "#OK"... son líneas del protocolo.
    if (t === '' || t === '#' || t.startsWith('# ') || t.startsWith('#\t')) return;
    const tab = line.indexOf('\t');
    if (tab < 0) throw new Error(`${name}:${i + 1}: fixture sin expectativa`);
    out.push({ line: line.slice(0, tab), json: JSON.parse(line.slice(tab + 1)) as Record<string, unknown>, where: `${name}:${i + 1}` });
  });
  return out;
}
