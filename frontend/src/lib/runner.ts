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
