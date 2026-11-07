// Conjuntos de caracteres de Foundation (FS-05): `.whitespaces` = categoría Zs + tabulador;
// `.whitespacesAndNewlines` añade los saltos de línea de Unicode.
const ZS = '                　';
export const WHITESPACES = `\t${ZS}`;
export const WHITESPACES_AND_NEWLINES = `${WHITESPACES}\n\u000B\u000C\r\u0085  `;

/** `trimmingCharacters(in:)`: recorta ambos extremos mientras el carácter esté en `chars`. */
export function trimmingCharacters(s: string, chars: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s.charAt(start))) start++;
  while (end > start && chars.includes(s.charAt(end - 1))) end--;
  return s.slice(start, end);
}
