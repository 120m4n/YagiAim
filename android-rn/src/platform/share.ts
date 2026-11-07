// SF-02 — hoja de compartir del sistema (ShareLink → ACTION_SEND con un URI content:// de FileProvider).
import * as Sharing from 'expo-sharing';

export const MIME_CSV = 'text/csv';
export const MIME_JSON = 'application/json';

export async function shareFile(uri: string, mimeType: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType });
}
