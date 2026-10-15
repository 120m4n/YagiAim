// SF-02 — archivos: sesiones en filesDir/Sessions con escritura atómica; exportaciones en cacheDir.
import { Directory, File, Paths } from 'expo-file-system';

export interface FileStore {
  /** Escribe en un temporal y lo mueve encima del destino (equivale a `.atomic`). */
  writeAtomic(dir: string, name: string, text: string): void;
  read(dir: string, name: string): string;
  list(dir: string): string[];
  remove(dir: string, name: string): void;
}

const dirOf = (name: string) => new Directory(Paths.document, name);

export const sessionsDirName = 'Sessions';

export const documentFiles: FileStore = {
  writeAtomic(dir, name, text) {
    const d = dirOf(dir);
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const tmp = new File(d, `${name}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(text);
    tmp.moveSync(new File(d, name), { overwrite: true });
  },
  read: (dir, name) => new File(dirOf(dir), name).textSync(),
  list(dir) {
    const d = dirOf(dir);
    return d.exists ? d.list().filter((e): e is File => e instanceof File).map((f) => f.name) : [];
  },
  remove: (dir, name) => new File(dirOf(dir), name).delete(),
};

/** Archivo temporal de exportación en cacheDir (se reescribe en cada llamada). Devuelve su URI `file://`. */
export function writeCacheFile(name: string, text: string): string {
  const f = new File(Paths.cache, name);
  if (!f.exists) f.create({ intermediates: true });
  f.write(text);
  return f.uri;
}
