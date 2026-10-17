import { useEffect, useRef, useState } from 'react';
import type { CutoffStatus } from '../api/types';
import { SERVICE_INFO, SERVICES } from '../lib/services';
import { StatusShape } from './StatusShape';

const STATUSES: { status: CutoffStatus; label: string }[] = [
  { status: 'OK', label: "plus d'1 h de marge" },
  { status: 'TIGHT', label: "moins d'1 h de marge" },
  { status: 'MISSED', label: 'barrière dépassée' },
  { status: 'NONE', label: 'pas de barrière' },
];

/**
 * Légende à la demande : un « ? » en bas de l'écran. Les icônes et les badges portent déjà leur
 * mot ; elle rappelle les formes de la carte et du profil, et le sens des codes du roadbook.
 */
export function Legend() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="legend-help no-print">
      {open && (
        <div ref={panel} className="legend-panel" role="dialog" aria-label="Légende">
          <h2>Légende</h2>
          <h3>Marges sur les barrières</h3>
          <p className="muted small">Forme des points sur la carte et le profil :</p>
          <ul>
            {STATUSES.map(({ status, label }) => (
              <li key={status}><StatusShape status={status} size={14} /> {label}</li>
            ))}
          </ul>
          <h3>Ravitos</h3>
          <ul>
            {SERVICES.map((s) => (
              <li key={s}><span aria-hidden>{SERVICE_INFO[s].icon}</span> {SERVICE_INFO[s].label}</li>
            ))}
          </ul>
          <h3>Codes des points</h3>
          <p className="small">
            Ce sont ceux du roadbook officiel (par exemple 1P pour le départ, 1D pour l'arrivée). Un pointage est un
            contrôle de passage, sans ravitaillement.
          </p>
        </div>
      )}
      <button ref={button} type="button" className="legend-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label="Légende : formes, icônes et codes" title="Légende">?</button>
    </div>
  );
}
