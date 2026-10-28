import { handleAppLink, isNativeApp } from './platform';
import { stravaConnectUrl } from './client';

/**
 * Ce qui ne se fait pas comme sur le site dans l'appli iPhone (Capacitor) : la connexion Strava dans le navigateur
 * intégré, le retour dans l'appli par son lien (ravitaille://strava?…), la barre d'état. Les modules natifs ne sont
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

/** À l'ouverture de l'appli : retour de Strava, barre d'état, écran de lancement. Sans effet sur le site. */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native');
  // Une appli ne zoome pas : iOS agrandissait la page en touchant un champ, et elle débordait ensuite sur les côtés.
  document.querySelector('meta[name=viewport]')?.setAttribute('content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  const [{ App }, { Browser }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/browser'), import('@capacitor/status-bar'), import('@capacitor/splash-screen'),
  ]);
  // Strava rouvre l'appli par son lien : la connexion est gardée, puis l'appli repart comme le site au retour de
  // Strava (?strava=…), import ouvert dans « Mon plan ».
  await App.addListener('appUrlOpen', ({ url }) => {
    const result = handleAppLink(url);
    if (result === null) return;
    void Browser.close().catch(() => undefined);
    window.location.replace(`/?strava=${encodeURIComponent(result)}`);
  });
  await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
}
