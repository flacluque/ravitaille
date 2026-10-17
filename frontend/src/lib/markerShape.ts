import type { CutoffStatus } from '../api/types';
import { STATUS_COLORS } from './colors';

/**
 * Forme de chaque statut de barrière, pour qu'il se lise sans la couleur (carte, profil, légende) :
 * cercle = marge confortable, triangle = moins d'1 h, carré = barrière dépassée, anneau = pas de barrière.
 */
/** Tracé SVG de la forme, centrée en (cx, cy), de « rayon » r (même encombrement visuel pour toutes). */
export function statusShapePath(status: CutoffStatus, cx: number, cy: number, r: number): string {
  const f = (n: number) => n.toFixed(2);
  switch (status) {
    case 'TIGHT': {
      const t = r * 1.3;
      return `M${f(cx)},${f(cy - t)}L${f(cx + t * 1.05)},${f(cy + t * 0.75)}L${f(cx - t * 1.05)},${f(cy + t * 0.75)}Z`;
    }
    case 'MISSED': {
      const s = r * 0.92;
      return `M${f(cx - s)},${f(cy - s)}H${f(cx + s)}V${f(cy + s)}H${f(cx - s)}Z`;
    }
    default:
      return `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
  }
}

/** Remplissage et contour : l'anneau « pas de barrière » est creux. */
export function statusShapePaint(status: CutoffStatus): { fill: string; stroke: string } {
  const color = STATUS_COLORS[status];
  return status === 'NONE' ? { fill: '#ffffff', stroke: color } : { fill: color, stroke: '#ffffff' };
}

/** Le triangle porte son centre visuel plus bas : décalage vertical du texte qu'on y inscrit. */
export function statusTextOffset(status: CutoffStatus, r: number): number {
  return status === 'TIGHT' ? r * 0.3 : 0;
}

/** Icône SVG autonome (marqueurs Leaflet). */
export function statusShapeSvg(status: CutoffStatus, r: number): string {
  const size = Math.ceil(r * 3.2);
  const c = size / 2;
  const { fill, stroke } = statusShapePaint(status);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
    + `<path d="${statusShapePath(status, c, c, r)}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
