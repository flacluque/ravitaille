import type { CheckpointEta, Marker, RacePlan } from '../api/types';
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
export function estimatedMinutesAt(trackKm: number, plan: RacePlan, markers: Marker[]): number | null {
  const etas = plan.checkpoints;
  if (markers.length !== etas.length || etas.length < 2) return null;
  for (let i = 1; i < etas.length; i++) {
    const k0 = markers[i - 1].trackKm;
    const k1 = markers[i].trackKm;
    if (trackKm <= k1 || i === etas.length - 1) {
      const t0 = localMinutes(etas[i - 1].departure);
      const t1 = localMinutes(etas[i].arrival);
      const ratio = k1 === k0 ? 0 : Math.min(1, Math.max(0, (trackKm - k0) / (k1 - k0)));
      return t0 + (t1 - t0) * ratio;
    }
  }
  return null;
}
