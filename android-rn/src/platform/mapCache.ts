// PM-01 / FR-017 — caché de teselas del motor de mapa (MapLibre): 500 MB, tamaño en disco y borrado.
import { Directory, File, Paths } from 'expo-file-system';
import { OfflineManager, TransformRequestManager } from '@maplibre/maplibre-react-native';

export const CACHE_MAX_BYTES = 500_000_000;
export const USER_AGENT = 'MeshAzimuth/1.0 (co.electrosoftware.meshazimuth)';

/** Se llama una vez al arrancar: tamaño máximo de la caché y `User-Agent` propio para las teselas OSM. */
export function configureMapEngine(): void {
  void OfflineManager.setMaximumAmbientCacheSize(CACHE_MAX_BYTES);
  TransformRequestManager.addHeader({ id: 'osm-user-agent', match: 'tile\\.openstreetmap\\.org', name: 'User-Agent', value: USER_AGENT });
}

/** Bytes de la base de datos de caché ambiente (`mbgl-offline.db*`). Se busca en filesDir y cacheDir (hasta un nivel). */
export function mapCacheBytes(): number {
  let total = 0;
  const visit = (d: Directory, depth: number) => {
    if (!d.exists) return;
    for (const e of d.list()) {
      if (e instanceof File) {
        if (e.name.startsWith('mbgl-offline.db')) total += e.size;
      } else if (depth > 0) {
        visit(e, depth - 1);
      }
    }
  };
  visit(Paths.document, 1);
  visit(Paths.cache, 1);
  return total;
}

export const clearMapCache = (): Promise<void> => OfflineManager.clearAmbientCache();
