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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessGate>{(info) => <App feedbackUrl={info?.feedbackUrl ?? null} />}</AccessGate>
  </StrictMode>,
);
