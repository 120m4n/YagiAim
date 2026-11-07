import { parseRepeaters } from '../../src/core/swiftJson';

// Formato `prettyPrinted` + `sortedKeys` de Swift (`"clave" : valor`), con BOM y coma final, que Swift acepta.
const swift = '﻿[\n  {\n    "hashPrefix" : "9A",\n    "id" : "CA01B0DD-6149-419F-9867-783BF9C8ED6F",\n    "latitude" : 6.863893,\n    "longitude" : -73.213817,\n    "name" : "Pico de la Vieja"\n  },\n]';

describe('parseRepeaters', () => {
  it('acepta el JSON exportado desde Swift', () => {
    const r = parseRepeaters(swift);
    expect('list' in r && r.list.map((x) => x.name)).toEqual(['Pico de la Vieja']);
  });
  it('explica el error', () => {
    expect(parseRepeaters('')).toEqual({ error: 'El archivo está vacío.' });
    expect(parseRepeaters('{')).toMatchObject({ error: expect.stringContaining('No es un JSON válido') });
    expect(parseRepeaters('{}')).toMatchObject({ error: expect.stringContaining('lista JSON') });
    expect(parseRepeaters('[{"id":"x","name":"a","latitude":1,"longitude":2}]')).toEqual({ error: 'Repetidor #1: campo «id» ausente o inválido.' });
  });
});
