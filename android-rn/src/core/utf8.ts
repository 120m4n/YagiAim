// UTF-8 sin depender de TextEncoder/TextDecoder (T005: Hermes puede no traerlos).
// La decodificación reemplaza con U+FFFD cada "subparte máxima" inválida, igual que `String(decoding:as:)` de Swift (FS-06).

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // sustituto suelto: Swift no puede representarlo
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: ArrayLike<number>): string {
  let out = '';
  let i = 0;
  const n = bytes.length;
  const at = (k: number) => bytes[k] as number;
  while (i < n) {
    const b = at(i);
    if (b < 0x80) { out += String.fromCharCode(b); i++; continue; }
    let need = 0;
    let cp = 0;
    let lower = 0x80;
    let upper = 0xbf;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; if (b === 0xe0) lower = 0xa0; if (b === 0xed) upper = 0x9f; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; if (b === 0xf0) lower = 0x90; if (b === 0xf4) upper = 0x8f; }
    else { out += '�'; i++; continue; }
    i++;
    let ok = true;
    for (let k = 0; k < need; k++) {
      const c = i < n ? at(i) : -1;
      if (c < lower || c > upper) { ok = false; break; }
      lower = 0x80; upper = 0xbf;
      cp = (cp << 6) | (c & 0x3f);
      i++;
    }
    out += ok ? String.fromCodePoint(cp) : '�';
  }
  return out;
}
