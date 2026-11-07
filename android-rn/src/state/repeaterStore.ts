// RepeaterStore.swift — repetidores guardados como JSON; guarda en cada cambio.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { mergeRepeaters, type Repeater } from '../core/repeater';
import { decodeRepeaters, encodeRepeaters } from '../core/swiftJson';
import { parseUuid } from '../core/uuid';
import { Keys, type Kv } from '../platform/kv';

export interface RepeaterState {
  repeaters: Repeater[];
  selectedID: string | undefined;
}

export class RepeaterStore {
  readonly store: StoreApi<RepeaterState>;

  constructor(private readonly kv: Kv) {
    // Como en Swift, el init no escribe: solo lee (JSON inválido → [] sin error visible).
    const json = kv.getString(Keys.repeatersV1);
    const list = (json !== undefined ? decodeRepeaters(json) : undefined) ?? [];
    const s = kv.getString(Keys.repeatersSelected);
    this.store = createStore<RepeaterState>(() => ({ repeaters: list, selectedID: s === undefined ? undefined : parseUuid(s) }));
  }

  get repeaters(): Repeater[] {
    return this.store.getState().repeaters;
  }
  get selectedID(): string | undefined {
    return this.store.getState().selectedID;
  }
  get selected(): Repeater | undefined {
    return selectedOf(this.store.getState());
  }

  set selectedID(id: string | undefined) {
    this.store.setState({ selectedID: id });
    this.kv.setString(Keys.repeatersSelected, id); // undefined → borra la clave
  }

  private setRepeaters(list: Repeater[]): void {
    this.store.setState({ repeaters: list });
    try {
      this.kv.setString(Keys.repeatersV1, encodeRepeaters(list));
    } catch {
      // `if let data = try? JSONEncoder().encode(...)`: si no se puede codificar, no se guarda
    }
  }

  add(r: Repeater): void {
    this.setRepeaters([...this.repeaters, r]);
    this.selectedID = r.id;
  }

  update(r: Repeater): void {
    const i = this.repeaters.findIndex((x) => x.id === r.id);
    if (i < 0) return;
    this.setRepeaters(this.repeaters.map((x, j) => (j === i ? r : x)));
  }

  delete(r: Repeater): void {
    this.setRepeaters(this.repeaters.filter((x) => x.id !== r.id));
    if (this.selectedID === r.id) this.selectedID = this.repeaters[0]?.id;
  }

  /** Fusiona una lista importada: omite inválidos y duplicados (mismo id, o mismo nombre y coordenadas). */
  merge(list: readonly Repeater[]): { added: number; skipped: number } {
    const m = mergeRepeaters(this.repeaters, list);
    this.setRepeaters(m.list);
    return { added: m.added, skipped: m.skipped };
  }
}

export const selectedOf = (s: RepeaterState): Repeater | undefined => s.repeaters.find((r) => r.id === s.selectedID);
