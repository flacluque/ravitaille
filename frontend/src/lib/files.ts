import { isNativeApp } from '../api/platform';

/**
 * Remet un fichier préparé par l'appli (parcours .fit ou .gpx, PDF, roadbook) au coureur. Sur le site : un
 * téléchargement, comme avant. Dans l'appli : la feuille de partage du téléphone, d'où le fichier part directement
 * dans Garmin Connect, COROS, Fichiers, Mail… Renvoie « shared » si le coureur l'a partagé, « cancelled » s'il a
 * refermé la feuille, « downloaded » sinon.
 */
export async function saveFile(blob: Blob, filename: string, title?: string): Promise<'downloaded' | 'shared' | 'cancelled'> {
  if (isNativeApp()) {
    try {
      return await shareNative(blob, filename, title ?? filename);
    } catch {
      // Partage impossible : on retombe sur le téléchargement.
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

/** Le fichier est écrit dans le cache de l'appli, puis remis à la feuille de partage d'iOS. */
async function shareNative(blob: Blob, filename: string, title: string): Promise<'shared' | 'cancelled'> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title, files: [uri] });
    return 'shared';
  } catch (e) {
    // Feuille refermée sans choisir d'appli : ce n'est pas une erreur.
    if (e instanceof Error && /cancel/i.test(e.message)) return 'cancelled';
    throw e;
  }
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
