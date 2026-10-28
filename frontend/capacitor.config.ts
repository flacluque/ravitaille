import type { CapacitorConfig } from '@capacitor/cli';

// Appli iPhone : le site construit pour l'appli (npm run build:app → dist/), emballé par Capacitor.
const config: CapacitorConfig = {
  appId: 'fr.ravitaille.app',
  appName: 'Ravitaille',
  webDir: 'dist',
  ios: {
    // Fond de l'appli pendant le chargement (comme le site).
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
  },
};

export default config;
