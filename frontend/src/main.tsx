import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/barlow-semi-condensed/800.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';
import { AccessGate } from './components/AccessGate';
import { CrewApp } from './components/CrewApp';
import { isCrewLink } from './lib/crew';
import { initNativeApp } from './api/native';

void initNativeApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Lien envoyé à l'assistance : sa propre page, sans code d'invitation (tout est dans le lien). */}
    {isCrewLink(window.location.hash)
      ? <CrewApp />
      : <AccessGate>{(info) => <App feedbackUrl={info?.feedbackUrl ?? null} />}</AccessGate>}
  </StrictMode>,
);
