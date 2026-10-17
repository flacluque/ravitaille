import { useState } from 'react';
import type { CutoffStatus } from '../api/types';
import { StatusShape } from './StatusShape';
import { SERVICE_INFO, SERVICES } from '../lib/services';

const STATUSES: { status: CutoffStatus; label: string; short: string }[] = [
  { status: 'OK', label: "plus d'1 h de marge", short: '> 1 h' },
  { status: 'TIGHT', label: "moins d'1 h", short: '< 1 h' },
  { status: 'MISSED', label: 'barrière dépassée', short: 'dépassée' },
  { status: 'NONE', label: 'pas de barrière', short: 'aucune' },
];

const STORAGE_KEY = 'trail-planner:legende-repliee';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Légende toujours visible en bas de l'écran : icônes des services des ravitos et couleurs des
 * marges sur les barrières (carte, profil, tableaux). Repliable, surtout pour les petits écrans.
 */
export function Legend() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // stockage indisponible : la légende se dépliera au prochain chargement
    }
  }

  if (collapsed) {
    return (
      <button type="button" className="legend-pill no-print" onClick={toggle} aria-expanded={false}>
        Légende
      </button>
    );
  }

  return (
    <aside className="legend no-print" aria-label="Légende">
      <div className="legend-group">
        <span className="legend-title">Ravitos</span>
        {SERVICES.map((s) => (
          <span key={s} className="legend-item">
            <span aria-hidden>{SERVICE_INFO[s].icon}</span>
            <span className="long">{SERVICE_INFO[s].label}</span>
            <span className="short" aria-hidden>{SERVICE_INFO[s].short}</span>
          </span>
        ))}
      </div>
      <div className="legend-group">
        <span className="legend-title">Marges</span>
        {STATUSES.map(({ status, label, short }) => (
          <span key={status} className="legend-item">
            <StatusShape status={status} />
            <span className="long">{label}</span>
            <span className="short" aria-hidden>{short}</span>
          </span>
        ))}
      </div>
      <button type="button" className="ghost legend-close" onClick={toggle} aria-expanded aria-label="Replier la légende" title="Replier">
        ▾
      </button>
    </aside>
  );
}
