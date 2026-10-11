import type { CutoffStatus } from '../api/types';

// Couleurs utilisées dans les attributs SVG (Leaflet, profil), où var(--…) n'est pas fiable.
// Mêmes valeurs que dans styles.css.
export const TRACK_COLOR = '#c2410c';
export const ACCENT_COLOR = '#1f4d3a';

export const STATUS_COLORS: Record<CutoffStatus, string> = {
  NONE: '#64748b',
  OK: '#15803d',
  TIGHT: '#d97706',
  MISSED: '#dc2626',
};
