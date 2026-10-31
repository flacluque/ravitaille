import type { CapacitorConfig } from '@capacitor/cli';

// Appli iPhone : le site construit pour l'appli (npm run build:app → dist/), emballé par Capacitor.
const config: CapacitorConfig = {
  appId: 'fr.ravitime.app',
  appName: 'Ravitime',
  webDir: 'dist',
  ios: {
    // Fond de l'appli pendant le chargement (comme le site).
    backgroundColor: '#f6f4ef',
  },
  android: {
    backgroundColor: '#f6f4ef',
  },
  plugins: {
    // L'écran de lancement reste jusqu'à ce que sa copie animée soit affichée dans la page (LaunchIntro), au plus 4 s.
    SplashScreen: {
      launchShowDuration: 4000,
      launchFadeOutDuration: 300,
      backgroundColor: '#1f4d3a',
      showSpinner: false,
    },
    // Android : l'appli s'affiche bord à bord ; env(safe-area-inset-*) donne la place de la barre d'état et de la barre
    // de navigation, comme sur l'iPhone (viewport-fit=cover, posé dans index.html et par l'appli).
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
