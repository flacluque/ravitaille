import type { CheckpointEta, Marker, ProfilePoint, RacePlan } from '../api/types';
import { durationMinutes, localMinutes } from './format';

/** Barrière qui compte pour un point : la plus serrée des deux (entrée / sortie). */
export interface Cutoff {
  at: string;
  marginMinutes: number;
  /** Vrai si c'est la barrière de sortie de ravito. */
  out: boolean;
}

export function bindingCutoff(eta: CheckpointEta): Cutoff | null {
  const candidates: Cutoff[] = [];
  if (eta.cutoffIn && eta.marginIn) {
    candidates.push({ at: eta.cutoffIn, marginMinutes: durationMinutes(eta.marginIn), out: false });
  }
  if (eta.cutoffOut && eta.marginOut) {
    candidates.push({ at: eta.cutoffOut, marginMinutes: durationMinutes(eta.marginOut), out: true });
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.marginMinutes < a.marginMinutes ? b : a));
}

/** La barrière la plus serrée de tout le plan (pour le résumé). */
export function tightestCutoff(plan: RacePlan): { eta: CheckpointEta; cutoff: Cutoff } | null {
  let best: { eta: CheckpointEta; cutoff: Cutoff } | null = null;
  for (const eta of plan.checkpoints) {
    const cutoff = bindingCutoff(eta);
    if (cutoff && (!best || cutoff.marginMinutes < best.cutoff.marginMinutes)) {
      best = { eta, cutoff };
    }
  }
  return best;
}

/**
 * La barrière la plus serrée tous scénarios confondus : ce qui arrive si la journée tourne mal.
 * null si aucune barrière.
 */
export function worstCutoff(plans: RacePlan[]): { scenario: number; eta: CheckpointEta; cutoff: Cutoff } | null {
  let worst: { scenario: number; eta: CheckpointEta; cutoff: Cutoff } | null = null;
  plans.forEach((plan, scenario) => {
    const t = tightestCutoff(plan);
    if (t && (!worst || t.cutoff.marginMinutes < worst.cutoff.marginMinutes)) worst = { scenario, ...t };
  });
  return worst;
}

/**
 * Heure de passage estimée à un km de la trace, en minutes "locales" (cf. localMinutes).
 * Interpolation linéaire entre le départ d'un ravito et l'arrivée au suivant : c'est une
 * approximation (le plan ne détaille pas l'allure dans un tronçon), suffisante pour le survol.
 * Les ravitos sont repérés par leur position sur la trace (markers), dans le même ordre que le plan.
 */
export function estimatedMinutesAt(trackKm: number, plan: RacePlan, markers: Marker[], profile?: ProfilePoint[]): number | null {
  const etas = plan.checkpoints;
  if (markers.length !== etas.length || etas.length < 2) return null;
  for (let i = 1; i < etas.length; i++) {
    const k0 = markers[i - 1].trackKm;
    const k1 = markers[i].trackKm;
    if (trackKm <= k1 || i === etas.length - 1) {
      const t0 = localMinutes(etas[i - 1].departure);
      const t1 = localMinutes(etas[i].arrival);
      return t0 + (t1 - t0) * effortShare(trackKm, k0, k1, profile);
    }
  }
  return null;
}

/**
 * Part du tronçon [k0, k1] déjà faite au km `km`, en km-effort (1 km + 1 par 100 m de D+) : on avance moins vite
 * dans les montées, comme dans le calcul du plan. Sans profil, la part de distance.
 */
export function effortShare(km: number, k0: number, k1: number, profile?: ProfilePoint[]): number {
  if (k1 <= k0) return 0;
  const x = Math.min(k1, Math.max(k0, km));
  if (!profile || profile.length < 2) return (x - k0) / (k1 - k0);
  const effort = (k: number) => k + gainAt(profile, k) / 100;
  const total = effort(k1) - effort(k0);
  return total > 0 ? (effort(x) - effort(k0)) / total : (x - k0) / (k1 - k0);
}

/** D+ cumulé au km `km` de la trace, interpolé entre deux points du profil. */
function gainAt(profile: ProfilePoint[], km: number): number {
  let lo = 0;
  let hi = profile.length - 1;
  if (km <= profile[0].km) return profile[0].cumulativeGainM;
  if (km >= profile[hi].km) return profile[hi].cumulativeGainM;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].km <= km) lo = mid;
    else hi = mid;
  }
  const a = profile[lo];
  const b = profile[hi];
  const f = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
  return a.cumulativeGainM + (b.cumulativeGainM - a.cumulativeGainM) * f;
}

/**
 * Portions de la trace courues de nuit (km de la trace), d'après la part de nuit de chaque tronçon : une nuit
 * qui commence en fin de tronçon, ou qui finit en début de tronçon. Les tronçons voisins de nuit sont fusionnés.
 */
export function nightSpans(plan: RacePlan, markers: Marker[]): [number, number][] {
  const spans: [number, number][] = [];
  plan.checkpoints.forEach((eta, i) => {
    const from = markers[i - 1]?.trackKm;
    const to = markers[i]?.trackKm;
    if (i === 0 || from === undefined || to === undefined || !eta.legNightDuration) return;
    const night = durationMinutes(eta.legNightDuration);
    const total = durationMinutes(eta.legDuration);
    if (night < 1 || total <= 0) return;
    const share = Math.min(1, night / total);
    // Nuit qui tombe pendant le tronçon : le tronçon d'avant était de jour.
    const prevNight = durationMinutes(plan.checkpoints[i - 1]?.legNightDuration ?? 'PT0M') > 0;
    const span: [number, number] = share >= 0.999 || prevNight ? [from, from + (to - from) * share] : [to - (to - from) * share, to];
    const last = spans[spans.length - 1];
    if (last && Math.abs(last[1] - span[0]) < 0.05) last[1] = span[1];
    else spans.push(span);
  });
  return spans;
}
