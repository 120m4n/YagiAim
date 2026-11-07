// NetworkMonitor.swift / PM-13 — hay una ruta de red utilizable (NWPath.status == .satisfied), no "Internet verificado".
import { createStore, type StoreApi } from 'zustand/vanilla';

/** `subscribe` entrega `isConnected` (true / false / null = aún desconocido) y devuelve la baja. */
export type NetworkSource = (onChange: (isConnected: boolean | null) => void) => () => void;

export class NetworkStore {
  readonly store: StoreApi<{ isOnline: boolean }> = createStore(() => ({ isOnline: true }));
  private unsubscribe?: () => void;

  constructor(private readonly source: NetworkSource) {}

  start(): void {
    this.unsubscribe ??= this.source((connected) => {
      if (connected !== null) this.store.setState({ isOnline: connected });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
