import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';
import { AccessGate } from './components/AccessGate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessGate>{(info) => <App feedbackUrl={info?.feedbackUrl ?? null} />}</AccessGate>
  </StrictMode>,
);
