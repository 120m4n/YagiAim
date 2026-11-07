import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { followThrottled, type ThrottleOpts } from './throttle';

/** Valor de una tienda a cadencia limitada y con histéresis: re-renderiza como mucho cada `intervalMs`. */
export function useThrottled<S, T>(store: Pick<StoreApi<S>, 'getState' | 'subscribe'>, select: (s: S) => T, opts: ThrottleOpts<T>): T {
  const [v, setV] = useState(() => select(store.getState()));
  useEffect(() => followThrottled(store, select, opts, setV), []);
  return v;
}
