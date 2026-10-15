/**
 * `split(separator:maxSplits:omittingEmptySubsequences:)` de Swift (FS-05).
 * Con `maxSplits`, el último elemento es el resto de la cadena SIN tocar (JS `split` con límite lo descartaría).
 */
export function swiftSplit(s: string, sep: string, opts: { maxSplits?: number; omitEmpty?: boolean } = {}): string[] {
  const maxSplits = opts.maxSplits ?? Number.POSITIVE_INFINITY;
  const omitEmpty = opts.omitEmpty ?? true;
  const out: string[] = [];
  let start = 0;
  let splits = 0;
  let i = 0;
  while (i < s.length) {
    if (splits < maxSplits && s.startsWith(sep, i)) {
      // Un tramo vacío omitido no consume un corte (medido en los dorados: "!ERR  range x" → code "range", detalle "x").
      if (!omitEmpty || i > start) {
        out.push(s.slice(start, i));
        splits++;
      }
      i += sep.length;
      start = i;
    } else {
      i++;
    }
  }
  if (!omitEmpty || start < s.length) out.push(s.slice(start));
  return out;
}
