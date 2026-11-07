// RepeaterStore.swift L5–25 y L65–77 — modelo y reglas puras del repetidor.
import { WHITESPACES, trimmingCharacters } from './foundation';
import { splitGraphemes } from './graphemes';
import type { Coordinate } from './geo';

export interface Repeater {
  id: string; // UUID en mayúsculas (FS-12)
  name: string;
  latitude: number;
  longitude: number;
  /** Altitud de la antena del repetidor (m s.n.m.), opcional, para elevación. */
  altitude?: number;
  /** Primer byte de la clave pública del repetidor (2 hex), para el pinger. */
  hashPrefix?: string;
}

export const repeaterCoordinate = (r: Repeater): Coordinate => ({ latitude: r.latitude, longitude: r.longitude });

/** "a1" → "A1". `undefined` si no son exactamente 2 dígitos hexadecimales ASCII. */
export function normalizedHashPrefix(text: string): string | undefined {
  const t = trimmingCharacters(text, WHITESPACES).toUpperCase();
  return splitGraphemes(t).length === 2 && /^[0-9A-F]{2}$/.test(t) ? t : undefined;
}

/** Fusiona una lista importada: omite inválidos y duplicados (mismo id, o mismo nombre y coordenadas). */
export function mergeRepeaters(existing: readonly Repeater[], incoming: readonly Repeater[]): { list: Repeater[]; added: number; skipped: number } {
  const list = [...existing];
  let added = 0;
  for (const r of incoming) {
    const valid = r.name !== '' && Math.abs(r.latitude) <= 90 && Math.abs(r.longitude) <= 180;
    const dup = list.some((x) => x.id === r.id || (x.name === r.name && x.latitude === r.latitude && x.longitude === r.longitude));
    if (valid && !dup) {
      list.push(r);
      added += 1;
    }
  }
  return { list, added, skipped: incoming.length - added };
}
