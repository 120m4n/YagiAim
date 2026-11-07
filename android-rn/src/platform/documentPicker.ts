// SF-02 — importación: selector de documentos del sistema (SAF ACTION_OPEN_DOCUMENT) filtrado a JSON.
import { File } from 'expo-file-system';

/** Texto del archivo elegido, o `undefined` si el usuario canceló. Lanza si no se puede leer (→ "No se pudo abrir el archivo."). */
export async function pickJsonText(): Promise<string | undefined> {
  const r = await File.pickFileAsync({ mimeTypes: 'application/json' });
  if (r.canceled) return undefined;
  return await r.result.text();
}
