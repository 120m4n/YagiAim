// Plan D: la interfaz no debe repintarse a la cadencia del sensor. `followThrottled` entrega el valor derivado de una tienda
// como mucho cada `intervalMs` y solo si `changed` (histéresis) lo considera distinto del último entregado.
import type { StoreApi } from 'zustand/vanilla';

export interface ThrottleOpts<T> {
  intervalMs: number;
  /** ¿`next` difiere lo bastante de `prev` para entregarlo? */
  changed: (prev: T, next: T) => boolean;
  now?: () => number;
}

export function followThrottled<S, T>(store: Pick<StoreApi<S>, 'getState' | 'subscribe'>, select: (s: S) => T, opts: ThrottleOpts<T>, onValue: (v: T) => void): () => void {
  const now = opts.now ?? Date.now;
  let last = select(store.getState());
  let lastAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const commit = () => {
    timer = undefined;
    const v = select(store.getState());
    if (!opts.changed(last, v)) return;
    last = v;
    lastAt = now();
    onValue(v);
  };
  const unsub = store.subscribe(() => {
    if (timer !== undefined || !opts.changed(last, select(store.getState()))) return;
    const wait = lastAt + opts.intervalMs - now();
    if (wait <= 0) commit();
    else timer = setTimeout(commit, wait);
  });
  return () => {
    unsub();
    clearTimeout(timer);
  };
}

/** Cambio de un ángulo (o ausencia) con umbral en grados por el camino corto. */
export const angleChanged = (minDeg: number) => (a: number | undefined, b: number | undefined): boolean => {
  if (a === undefined || b === undefined) return a !== b;
  const d = Math.abs(((b - a + 540) % 360) - 180);
  return d >= minDeg;
};

/** Cambio de un número (o ausencia) con umbral. */
export const numberChanged = (minDelta: number) => (a: number | undefined, b: number | undefined): boolean =>
  a === undefined || b === undefined ? a !== b : Math.abs(b - a) >= minDelta;
