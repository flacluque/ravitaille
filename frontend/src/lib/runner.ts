import type { RunnerProfile } from '../api/types';

/** Lecture du profil personnel du coureur (pente et fatigue) en phrases. */

/** Exposant de fatigue du coureur moyen (scénario réaliste, Scenario.REALISTE côté serveur). */
export const STANDARD_FATIGUE = 1.07;

/** « +12 % », « −8 % » : pente d'une tranche. */
export function slopeLabel(grade: number): string {
  const pct = Math.round(grade * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`;
}

/** Rapport au coût standard → phrase : 0,82 → « 18 % plus rapide ». */
export function slopeVerdict(ratio: number): { text: string; tone: 'faster' | 'slower' | 'same' } {
  const pct = Math.round((ratio - 1) * 100);
  if (Math.abs(pct) < 3) return { text: 'comme la moyenne', tone: 'same' };
  return pct < 0
    ? { text: `${-pct} % plus rapide`, tone: 'faster' }
    : { text: `${pct} % plus lent`, tone: 'slower' };
}

/**
 * Effet de la fatigue mesurée : le temps estimé d'une course 2,5 fois plus longue (en effort) que la référence change
 * de 2,5^(b − 1,07) par rapport au coureur moyen (loi de Riegel, T = a × E^b, a calé sur la référence).
 */
export function fatigueEffect(exponent: number): { verdict: string; longRacePercent: number } {
  const delta = exponent - STANDARD_FATIGUE;
  const longRacePercent = Math.round((2.5 ** delta - 1) * 100);
  const verdict = Math.abs(delta) < 0.01 ? 'Tu ralentis au fil des heures comme le coureur moyen.'
    : delta > 0 ? 'Tu ralentis plus que le coureur moyen au fil des heures.'
      : 'Tu tiens mieux ton rythme que le coureur moyen au fil des heures.';
  return { verdict, longRacePercent };
}

/** Ce que le plan peut garder d'une course analysée (RaceResult dans le stockage). */
interface CountedRace {
  fatigueExponent: number | null;
  use: boolean;
}

/** Bornes de la fatigue acceptée par le serveur (RunnerProfile.MIN_FATIGUE / MAX_FATIGUE). */
const FATIGUE_MIN = 1.02;
const FATIGUE_MAX = 1.25;

/**
 * Fatigue du coureur d'après ses courses analysées : la moyenne de celles qu'il compte, rapprochée du coureur moyen
 * quand elles sont peu nombreuses (une course : la moitié du chemin, deux : les deux tiers…). null sans course comptée.
 */
export function racesFatigue(races: CountedRace[]): number | null {
  const used = races.filter((r) => r.use && typeof r.fatigueExponent === 'number').map((r) => r.fatigueExponent as number);
  if (used.length === 0) return null;
  const mean = used.reduce((a, b) => a + b, 0) / used.length;
  const shrunk = STANDARD_FATIGUE + ((mean - STANDARD_FATIGUE) * used.length) / (used.length + 1);
  return Math.round(Math.min(FATIGUE_MAX, Math.max(FATIGUE_MIN, shrunk)) * 1000) / 1000;
}

/**
 * Profil envoyé avec le calcul : le coût selon la pente (mesuré sur Strava) et la fatigue de ses courses. null s'il
 * ne l'utilise pas, ou s'il n'y a ni l'un ni l'autre.
 */
export function appliedProfile(stored: { profile: RunnerProfile | null; use: boolean; races: CountedRace[] }): RunnerProfile | null {
  if (!stored.use) return null;
  const fatigue = racesFatigue(stored.races);
  if (!stored.profile && fatigue === null) return null;
  const base: RunnerProfile = stored.profile
    ?? { slope: [], fatigueExponent: STANDARD_FATIGUE, activities: 0, km: 0, longActivities: 0, from: null, to: null };
  return { ...base, fatigueExponent: fatigue ?? STANDARD_FATIGUE };
}
