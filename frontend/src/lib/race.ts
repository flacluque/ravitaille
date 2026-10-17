import type { CutoffStatus, RacePlan } from '../api/types';
import { localMinutes } from './format';
import { bindingCutoff } from './plan';

/** Point où le coureur s'est signalé, et l'heure (minutes « locales », voir localMinutes). */
export interface Fix {
  index: number;
  atMinutes: number;
}

/** L'heure du téléphone, dans le même repère que les heures du plan (heure murale locale). */
export function nowMinutes(now = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()) / 60000;
}

/** Avance (négatif) ou retard (positif) sur le plan, en minutes, d'après le dernier recalage. */
export function offsetMinutes(plan: RacePlan, fix: Fix | null): number {
  if (!fix) return 0;
  const eta = plan.checkpoints[fix.index];
  return eta ? fix.atMinutes - localMinutes(eta.arrival) : 0;
}

/** Heure d'arrivée prévue à un point, décalée de l'avance ou du retard. Les points déjà passés gardent le plan. */
export function adjustedArrival(plan: RacePlan, index: number, fix: Fix | null): number {
  const planned = localMinutes(plan.checkpoints[index].arrival);
  if (fix && index === fix.index) return fix.atMinutes;
  return fix && index > fix.index ? planned + offsetMinutes(plan, fix) : planned;
}

/** Marge sur la barrière d'un point, recalculée avec le décalage ; null sans barrière. */
export function adjustedMargin(plan: RacePlan, index: number, fix: Fix | null): { minutes: number; status: CutoffStatus; at: string; out: boolean } | null {
  const cutoff = bindingCutoff(plan.checkpoints[index]);
  if (!cutoff) return null;
  const shift = fix && index >= fix.index ? adjustedArrival(plan, index, fix) - localMinutes(plan.checkpoints[index].arrival) : 0;
  const minutes = cutoff.marginMinutes - shift;
  return { minutes, status: minutes < 0 ? 'MISSED' : minutes < 60 ? 'TIGHT' : 'OK', at: cutoff.at, out: cutoff.out };
}

export type Phase = 'before' | 'running' | 'finished';

/**
 * Où en est le coureur : avant le départ, en course (avec le prochain point), ou arrivé.
 * Le prochain point est le premier qu'il n'a pas encore atteint à l'heure décalée, et toujours après
 * celui où il s'est signalé.
 */
export function raceProgress(plan: RacePlan, now: number, fix: Fix | null): { phase: Phase; next: number } {
  const last = plan.checkpoints.length - 1;
  if (fix?.index === last) return { phase: 'finished', next: last };
  if (!fix && now < localMinutes(plan.checkpoints[0].departure)) return { phase: 'before', next: 0 };
  for (let i = Math.max(1, (fix?.index ?? 0) + 1); i <= last; i++) {
    if (adjustedArrival(plan, i, fix) > now) return { phase: 'running', next: i };
  }
  // Heure d'arrivée prévue dépassée sans recalage : on reste sur l'arrivée.
  return { phase: now > adjustedArrival(plan, last, fix) + 6 * 60 ? 'finished' : 'running', next: last };
}

/** Le jour J : de la veille à 18 h jusqu'à 6 h après l'arrivée prévue, l'appli s'ouvre sur « En course ». */
export function isRaceWindow(plan: RacePlan, now: number): boolean {
  const start = localMinutes(plan.start);
  const eve = Math.floor(start / 1440) * 1440 - 6 * 60;
  return now >= eve && now <= localMinutes(plan.finish) + 6 * 60;
}

/** « 1h12 », « 25 min » */
export function formatDelay(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return `${Math.round(m / 1440)} jours`;
}
