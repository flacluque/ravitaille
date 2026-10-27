/**
 * Le même code tourne sur le site et dans l'appli mobile (Capacitor). Sur le site, l'API est à la même adresse et la
 * connexion Strava et le code d'accès sont gardés par des cookies. Dans l'appli, l'API est sur le serveur en ligne
 * (VITE_API_BASE) et ces deux connexions voyagent dans des en-têtes, gardées par l'appli.
 */

/** Adresse du serveur : vide sur le site (même adresse), « https://… » pour l'appli. */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');

/** Vrai dans l'appli iPhone ou Android (Capacitor), faux sur le site. */
export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export function apiUrl(path: string): string {
  return API_BASE + path;
}

/** Adresse publique du site, pour les liens partagés (assistance) : l'appli n'a pas d'adresse web à elle. */
export function siteUrl(): string {
  return isNativeApp() ? API_BASE : window.location.origin;
}

/** En-têtes de l'appli (voir WebConfig côté serveur). */
export const STRAVA_HEADER = 'X-Ravitaille-Strava';
export const ACCESS_HEADER = 'X-Ravitaille-Access';

const STRAVA_KEY = 'trail-planner:app-strava';
const ACCESS_KEY = 'trail-planner:app-acces';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Stockage indisponible : la connexion vaut pour cette visite.
  }
}

/** En-têtes à ajouter à chaque appel de l'API depuis l'appli (connexion Strava, code d'accès). */
export function appHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const strava = read(STRAVA_KEY);
  const access = read(ACCESS_KEY);
  // Toujours présent dans l'appli, même vide : le serveur sait ainsi qu'il doit répondre par l'en-tête et non par cookie.
  headers[STRAVA_HEADER] = strava ?? '';
  if (access) headers[ACCESS_HEADER] = access;
  return headers;
}

/** Garde ce que le serveur renvoie dans ses en-têtes : connexion Strava renouvelée ou oubliée, code d'accès accepté. */
export function rememberFromResponse(headers: Headers): void {
  const strava = headers.get(STRAVA_HEADER);
  if (strava !== null) write(STRAVA_KEY, strava);
  const access = headers.get(ACCESS_HEADER);
  if (access) write(ACCESS_KEY, access);
}

/**
 * Retour de Strava dans l'appli, par son lien « ravitaille://strava?strava=connected&session=… » : la connexion
 * chiffrée est gardée. Renvoie le résultat (comme le « ?strava=… » du site), null pour un autre lien.
 */
export function handleAppLink(link: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/strava\/?\?(.*)$/i.exec(link);
  if (!m) return null;
  const params = new URLSearchParams(m[1]);
  const session = params.get('session');
  if (session) write(STRAVA_KEY, session);
  return params.get('strava');
}
