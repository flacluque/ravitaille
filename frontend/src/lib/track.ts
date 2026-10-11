import type { ProfilePoint } from '../api/types';

/** Point du profil le plus proche d'un km donné (profil trié par km croissant). */
export function pointAtKm(profile: ProfilePoint[], km: number): ProfilePoint {
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].km < km) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && km - profile[lo - 1].km < profile[lo].km - km) return profile[lo - 1];
  return profile[lo];
}

/** Point du profil le plus proche d'une position GPS (pour le survol de la carte). */
export function nearestPoint(profile: ProfilePoint[], lat: number, lon: number): ProfilePoint {
  // Distance équirectangulaire : largement suffisant pour comparer des points proches.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best = profile[0];
  let bestD = Infinity;
  for (const p of profile) {
    const dx = (p.lon - lon) * cosLat;
    const dy = p.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Graduations "rondes" entre min et max (environ `count` intervalles). */
export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
