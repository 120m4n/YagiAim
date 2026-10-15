// SF-01 — claves clave-valor (UserDefaults → MMKV). Síncrono, como UserDefaults, para que las tiendas lean antes del
// primer render. La interfaz `KvBackend` permite probar con un Map; MMKV está en kvMmkv.ts.

export interface KvBackend {
  getBoolean(key: string): boolean | undefined;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  set(key: string, value: boolean | string | number): void;
  remove(key: string): void;
}

/** Las 11 claves de SF-01, con los mismos nombres que la referencia. */
export const Keys = {
  onboardingDone: 'onboarding.done',
  mapSatellite: 'map.satellite',
  mapCamera: 'map.camera',
  tolerance: 'tolerance',
  listSortByDistance: 'list.sortByDistance',
  pingerSimulated: 'pinger.simulated',
  pingerLastDevice: 'pinger.lastDevice',
  repeatersV1: 'repeaters.v1',
  repeatersSelected: 'repeaters.selected',
  boomOffset: 'boom.offset',
  locationLast: 'location.last',
  /** Añadida en Android (PM-28): calibración propia del magnetómetro; no existe en iOS. */
  magCalibration: 'mag.calibration',
} as const;

export class Kv {
  constructor(private readonly b: KvBackend) {}

  getBool(key: string, fallback: boolean): boolean {
    return this.b.getBoolean(key) ?? fallback;
  }
  setBool(key: string, v: boolean): void {
    this.b.set(key, v);
  }
  getNumber(key: string, fallback: number): number {
    return this.b.getNumber(key) ?? fallback;
  }
  setNumber(key: string, v: number): void {
    this.b.set(key, v);
  }
  getString(key: string): string | undefined {
    return this.b.getString(key);
  }
  /** `undefined` borra la clave (UserDefaults.set(nil, forKey:)). */
  setString(key: string, v: string | undefined): void {
    if (v === undefined) this.b.remove(key);
    else this.b.set(key, v);
  }
  remove(key: string): void {
    this.b.remove(key);
  }

  /** `[Double]` guardado como JSON (map.camera). */
  getNumberArray(key: string): number[] | undefined {
    return this.parse(key, (v): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number'));
  }
  setNumberArray(key: string, v: number[]): void {
    this.b.set(key, JSON.stringify(v));
  }

  /** `[String: Double]` guardado como JSON (location.last). */
  getNumberDict(key: string): Record<string, number> | undefined {
    return this.parse(key, (v): v is Record<string, number> =>
      typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'number'));
  }
  setNumberDict(key: string, v: Record<string, number>): void {
    this.b.set(key, JSON.stringify(v));
  }

  private parse<T>(key: string, ok: (v: unknown) => v is T): T | undefined {
    const s = this.b.getString(key);
    if (s === undefined) return undefined;
    try {
      const v: unknown = JSON.parse(s);
      return ok(v) ? v : undefined;
    } catch {
      return undefined;
    }
  }
}

export function memoryBackend(): KvBackend & { data: Map<string, boolean | string | number> } {
  const data = new Map<string, boolean | string | number>();
  const typed = <T extends 'boolean' | 'string' | 'number'>(t: T) => (k: string) => {
    const v = data.get(k);
    return typeof v === t ? v : undefined;
  };
  return {
    data,
    getBoolean: typed('boolean') as (k: string) => boolean | undefined,
    getString: typed('string') as (k: string) => string | undefined,
    getNumber: typed('number') as (k: string) => number | undefined,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}
