import type { CourseView, Marker, Placement, ProfilePoint } from '../api/types';

/**
 * Ravitos placés sur la trace GPX (voir fr.trailplanner.engine.Placement côté serveur) : vérifications et calculs
 * de l'édition sur la carte.
 */

/** Écart entre le waypoint du GPX et le km du roadbook au-delà duquel le coureur doit trancher (km). */
export const CONFLICT_KM = 1.5;
/** Écart minimal gardé entre deux ravitos voisins pendant l'édition (km). */
export const NEIGHBOUR_GAP_KM = 0.1;

/** Position d'un ravito pendant l'édition : `manual` si le coureur l'a placé (sinon position automatique). */
export interface EditedPosition {
  km: number;
  manual: boolean;
}

/** Point de la trace au km donné, interpolé entre deux points du profil. */
export function pointAt(profile: ProfilePoint[], km: number): ProfilePoint {
  const last = profile[profile.length - 1];
  if (km <= profile[0].km) return profile[0];
  if (km >= last.km) return last;
  let lo = 0;
  let hi = profile.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].km <= km) lo = mid;
    else hi = mid;
  }
  const a = profile[lo];
  const b = profile[hi];
  const t = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    km,
    elevationM: lerp(a.elevationM, b.elevationM),
    cumulativeGainM: lerp(a.cumulativeGainM, b.cumulativeGainM),
    cumulativeLossM: lerp(a.cumulativeLossM, b.cumulativeLossM),
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
  };
}

/**
 * Km de la trace le plus proche d'une position de la carte, entre `lo` et `hi` : le ravito reste entre ses voisins,
 * et un autre passage de la trace au même endroit (boucle, aller-retour) n'est pas pris.
 */
export function snapToTrack(profile: ProfilePoint[], lat: number, lon: number, lo: number, hi: number): number | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (b.km < lo || a.km > hi) continue;
    const ax = a.lon * cosLat, ay = a.lat, bx = b.lon * cosLat, by = b.lat, px = lon * cosLat, py = lat;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a.km + t * (b.km - a.km);
    }
  }
  return best === null ? null : Math.max(lo, Math.min(hi, best));
}

/** Position que le serveur donne au ravito sans position placée à la main : son waypoint, sinon le km du roadbook. */
export function autoPosition(marker: Marker): { km: number; placement: Placement } {
  if (marker.placement === 'WAYPOINT' || (marker.placement === 'MANUAL' && typeof marker.waypointKm === 'number')) {
    return { km: marker.waypointKm ?? marker.trackKm, placement: 'WAYPOINT' };
  }
  return { km: marker.roadbookTrackKm ?? marker.trackKm, placement: 'ROADBOOK' };
}

export interface PlacementCheck {
  /** D+ cumulé de la trace à cette position. */
  trackGainM: number;
  /** D+ cumulé du roadbook, ramené au D+ total de la trace (null si le roadbook ne le donne pas). */
  expectedGainM: number | null;
  /** Le D+ de la trace ne colle pas avec celui du roadbook. */
  gainOff: boolean;
  /** Waypoint du GPX et km du roadbook à plus de CONFLICT_KM l'un de l'autre, sans position placée à la main. */
  conflict: boolean;
  /** À signaler : conflit, ou D+ qui ne colle pas sur une position automatique. */
  warn: boolean;
}

/**
 * Tolérance sur le D+ : 100 m, ou 5 % du D+ de la course si c'est plus. Le D+ de l'organisation et celui de la trace
 * ne sont pas lissés pareil : même un ravito bien placé s'écarte de quelques pourcents du D+ attendu.
 */
export function gainTolerance(totalGainM: number): number {
  return Math.max(100, 0.05 * totalGainM);
}

/** Vérifie la position du point `i` (départ et arrivée : rien à vérifier). */
export function checkPlacement(course: CourseView, i: number, pos: EditedPosition): PlacementCheck {
  const track = course.track;
  const cps = course.race.checkpoints;
  const marker = course.markers[i];
  const trackGainM = track ? pointAt(track.profile, pos.km).cumulativeGainM : 0;
  const none = { trackGainM, expectedGainM: null, gainOff: false, conflict: false, warn: false };
  if (!track || !marker || i === 0 || i === cps.length - 1) return none;
  const finishGain = cps[cps.length - 1].gainM;
  const gain = cps[i].gainM;
  const expectedGainM = gain !== null && finishGain && track.gainM > 0 ? (gain * track.gainM) / finishGain : null;
  const gainOff = expectedGainM !== null && Math.abs(trackGainM - expectedGainM) > gainTolerance(track.gainM);
  const conflict = !pos.manual && autoPosition(marker).placement === 'WAYPOINT'
    && typeof marker.waypointKm === 'number' && typeof marker.roadbookTrackKm === 'number'
    && Math.abs(marker.waypointKm - marker.roadbookTrackKm) > CONFLICT_KM;
  return { trackGainM, expectedGainM, gainOff, conflict, warn: conflict || (gainOff && !pos.manual) };
}

/** Positions de la course calculée, telles que le serveur les a placées. */
export function currentPositions(course: CourseView): EditedPosition[] {
  return course.markers.map((m) => ({ km: m.trackKm, manual: m.placement === 'MANUAL' }));
}

/** Ravitos à vérifier dans la course calculée (indices). */
export function placementWarnings(course: CourseView): number[] {
  if (!course.track) return [];
  return currentPositions(course).flatMap((pos, i) => (checkPlacement(course, i, pos).warn ? [i] : []));
}

/** Bornes de déplacement du point `i` : entre ses deux voisins. */
export function bounds(positions: EditedPosition[], i: number): { lo: number; hi: number } {
  return { lo: positions[i - 1].km + NEIGHBOUR_GAP_KM, hi: positions[i + 1].km - NEIGHBOUR_GAP_KM };
}

/** Positions à garder dans la course : km placé à la main, null pour une position automatique. */
export function savedPositions(positions: EditedPosition[]): (number | null)[] {
  const last = positions.length - 1;
  return positions.map((p, i) => (i > 0 && i < last && p.manual ? p.km : null));
}
