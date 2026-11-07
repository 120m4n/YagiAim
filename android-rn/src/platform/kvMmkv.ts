import { createMMKV } from 'react-native-mmkv';
import type { KvBackend } from './kv';

/** Respaldo real de `Kv` sobre MMKV (R-10). */
export function mmkvBackend(): KvBackend {
  const m = createMMKV();
  return {
    getBoolean: (k) => m.getBoolean(k),
    getString: (k) => m.getString(k),
    getNumber: (k) => m.getNumber(k),
    set: (k, v) => m.set(k, v),
    remove: (k) => void m.remove(k),
  };
}
