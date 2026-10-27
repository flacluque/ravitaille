import { isNativeApp } from '../api/platform';

/**
 * Remet un fichier préparé par l'appli (parcours .fit ou .gpx, PDF, roadbook) au coureur. Sur le site : un
 * téléchargement, comme avant. Dans l'appli : la feuille de partage du téléphone, d'où le fichier part directement
 * dans Garmin Connect, COROS, Fichiers, Mail… Renvoie « shared » si le coureur l'a partagé, « cancelled » s'il a
 * refermé la feuille, « downloaded » sinon.
 */
export async function saveFile(blob: Blob, filename: string, title?: string): Promise<'downloaded' | 'shared' | 'cancelled'> {
  if (isNativeApp()) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title ?? filename });
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        // Partage impossible : on retombe sur le téléchargement.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
