// Swift recorre `String` por Character (grafema extendido): FS-08 (nombre de archivo) y la escapada del CSV lo necesitan.
// Hermes puede no traer Intl.Segmenter (T005); sin él se usa una aproximación de UAX #29 (marcas combinantes, ZWJ,
// selectores de variación, modificadores de tono, banderas, CRLF).
type SegmenterCtor = new (l: string, o: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> };

const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;

const isExtend = (cp: number) =>
  (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f) ||
  (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f) || (cp >= 0xe0100 && cp <= 0xe01ef) ||
  (cp >= 0x900 && cp <= 0x903) || (cp >= 0x93a && cp <= 0x94f) || cp === 0x200c;
const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

export function splitGraphemesFallback(s: string): string[] {
  const cps = Array.from(s);
  const out: string[] = [];
  let i = 0;
  while (i < cps.length) {
    let g = cps[i] as string;
    const first = g.codePointAt(0) as number;
    i++;
    if (g === '\r' && cps[i] === '\n') { g += '\n'; i++; out.push(g); continue; }
    if (isRegional(first) && i < cps.length && isRegional(cps[i]!.codePointAt(0) as number)) { g += cps[i]; i++; }
    while (i < cps.length) {
      const cp = cps[i]!.codePointAt(0) as number;
      if (isExtend(cp)) { g += cps[i]; i++; }
      else if (cp === 0x200d && i + 1 < cps.length) { g += cps[i]! + cps[i + 1]!; i += 2; }
      else break;
    }
    out.push(g);
  }
  return out;
}

export function splitGraphemes(s: string): string[] {
  if (!Segmenter) return splitGraphemesFallback(s);
  return Array.from(new Segmenter('und', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
}
