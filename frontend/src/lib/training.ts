import { niceTicks } from './track';
import type { ReferenceInsight, TrainingWeek } from '../api/types';

/** "−3,1 %" : effet de la correction de forme sur le temps d'une référence. */
export function formEffect(factor: number): string {
  const pct = (factor - 1) * 100;
  if (Math.abs(pct) < 0.05) return '0 %';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** "+38 %" : écart de volume entre la préparation de la course et celle d'une référence. */
export function volumeChange(target: number, reference: number): string {
  const pct = Math.round((target / reference - 1) * 100);
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

/** Références dont la préparation est connue, pour les comparer à celle de la course. */
export function comparedReferences(refs: ReferenceInsight[]): (ReferenceInsight & { weeklyEffortKm: number })[] {
  return refs.filter((r): r is ReferenceInsight & { weeklyEffortKm: number } => r.weeklyEffortKm != null);
}

/** Semaine du 20/07 → "20/07". */
export function weekLabel(week: TrainingWeek): string {
  const [, m, d] = week.start.split('-');
  return `${d}/${m}`;
}

/** Graduations de l'axe des volumes, la dernière au-dessus du maximum. */
export function axisTicks(max: number): number[] {
  const ticks = niceTicks(0, max, 3);
  if (ticks.length < 2) return [0, max > 0 ? max : 10];
  const step = ticks[1] - ticks[0];
  const last = ticks[ticks.length - 1];
  return last < max ? [...ticks, last + step] : ticks;
}
