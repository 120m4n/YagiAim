// Session/SessionStore.swift — sesiones como JSON, una por archivo: `<filesDir>/Sessions/<uuid>.json` (pesan < 100 KB).
import { decodeSession, encodeSession } from '../core/swiftJson';
import type { Session } from '../core/sessionModels';
import { sessionsDirName, type FileStore } from '../platform/files';

export class SessionStore {
  constructor(private readonly files: FileStore, private readonly dir: string = sessionsDirName) {}

  private fileName = (id: string) => `${id}.json`;

  /** Escritura atómica. */
  save(session: Session): void {
    this.files.writeAtomic(this.dir, this.fileName(session.id), encodeSession(session));
  }

  load(id: string): Session {
    const s = decodeSession(this.files.read(this.dir, this.fileName(id)));
    if (!s) throw new Error(`Sesión ilegible: ${id}`);
    return s;
  }

  /** Sesiones guardadas, más recientes primero; las corruptas se omiten. `repeaterID` filtra por repetidor. */
  sessions(repeaterID?: string): Session[] {
    let names: string[];
    try {
      names = this.files.list(this.dir);
    } catch {
      return [];
    }
    return names
      .filter((n) => n.endsWith('.json'))
      .flatMap((n) => {
        try {
          const s = decodeSession(this.files.read(this.dir, n));
          return s ? [s] : [];
        } catch {
          return [];
        }
      })
      .filter((s) => repeaterID === undefined || s.repeater.id === repeaterID)
      .sort((a, b) => b.started.getTime() - a.started.getTime());
  }

  delete(id: string): void {
    this.files.remove(this.dir, this.fileName(id));
  }
}
