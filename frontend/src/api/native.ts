import { handleAppLink, isNativeApp } from './platform';
import { stravaConnectUrl } from './client';

/**
 * Ce qui ne se fait pas comme sur le site dans l'appli iPhone (Capacitor) : la connexion Strava dans le navigateur
 * intégré, le retour dans l'appli par son lien (ravitime://strava?…), la barre d'état. Les modules natifs ne sont
 * chargés que dans l'appli.
 */

/** Connexion à Strava : sur le site, la page part vers Strava ; dans l'appli, Strava s'ouvre par-dessus. */
export function connectStrava(): void {
  if (!isNativeApp()) {
    window.location.assign(stravaConnectUrl());
    return;
  }
  void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: stravaConnectUrl() }));
}

/** À l'ouverture de l'appli : retour de Strava, bouton retour d'Android, zoom. Sans effet sur le site. */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native');
  // Une appli ne zoome pas : iOS agrandissait la page en touchant un champ, et elle débordait ensuite sur les côtés.
  document.querySelector('meta[name=viewport]')?.setAttribute('content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
  // Strava rouvre l'appli par son lien : la connexion est gardée, puis l'appli repart comme le site au retour de
  // Strava (?strava=…), import ouvert dans « Mon plan ».
  await App.addListener('appUrlOpen', ({ url }) => {
    const result = handleAppLink(url);
    if (result === null) return;
    void Browser.close().catch(() => undefined);
    window.location.replace(`/?strava=${encodeURIComponent(result)}`);
  });
  // Bouton retour d'Android (sans effet sur l'iPhone) : il referme d'abord ce qui est ouvert par-dessus, puis revient
  // à la page d'avant (chaque page a son adresse #…), et quitte l'appli depuis la première.
  await App.addListener('backButton', ({ canGoBack }) => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      return;
    }
    if (document.querySelector('.modal-backdrop, .legend-panel, .date-picker')) {
      // Ces fenêtres se ferment avec Échap.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}

/**
 * Ouverture de l'appli (voir LaunchIntro) : l'écran de lancement d'iOS laisse la place, sans fondu, à sa copie dans la
 * page, qui s'anime ; la barre d'état passe en clair sur le vert.
 */
export async function launchShown(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([import('@capacitor/splash-screen'), import('@capacitor/status-bar')]);
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => undefined);
  } catch {
    // Modules natifs indisponibles : l'écran de lancement se retire seul (launchShowDuration).
  }
}

/** Fin de l'ouverture : la barre d'état repasse en sombre sur le fond clair de l'appli. */
export async function launchDone(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  } catch {
    // sans barre d'état native
  }
}
