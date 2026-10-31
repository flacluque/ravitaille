import type { Reference, ReferenceKind, StravaActivity } from '../api/types';
import { durationMinutes } from './format';

/** Distance et D+ de la course préparée, pour repérer les sorties qui lui ressemblent. */
export interface Target {
  km: number;
  gainM: number;
  /** Jour de la course ("2026-10-23"), qui place le bloc de préparation. */
  date?: string | null;
}

export interface ActivityFilter {
  minKm: number;
  racesOnly: boolean;
}

export const SPORT_LABELS: Record<string, string> = { Run: 'Course à pied', TrailRun: 'Trail' };

/** Km-effort : 100 m de D+ comptent comme 1 km, comme dans le moteur. */
const effort = (km: number, gainM: number) => km + gainM / 100;

/** Ressemblance avec la course, de 0 à 1 (1 = même effort), comme la pondération des références. */
export function closeness(a: StravaActivity, target: Target): number {
  const ratio = effort(a.distanceKm, a.elevationGainM) / effort(target.km, target.gainM);
  return 1 / (1 + Math.abs(Math.log(ratio)));
}

export function filterActivities(activities: StravaActivity[], filter: ActivityFilter): StravaActivity[] {
  return activities.filter((a) => a.distanceKm >= filter.minKm && (!filter.racesOnly || a.race));
}

/** Les plus proches de la course d'abord (à égalité, la plus récente), ou les plus récentes. */
export function sortActivities(activities: StravaActivity[], target: Target | null): StravaActivity[] {
  const byDate = (a: StravaActivity, b: StravaActivity) => b.date.localeCompare(a.date);
  if (!target) return [...activities].sort(byDate);
  return [...activities].sort((a, b) => closeness(b, target) - closeness(a, target) || byDate(a, b));
}

/** Identifiants des {@code count} sorties les plus proches de la course, à signaler. */
export function closest(activities: StravaActivity[], target: Target | null, count = 3): Set<number> {
  if (!target) return new Set();
  return new Set(sortActivities(activities, target).slice(0, count).map((a) => a.id));
}

/** Même jour et même distance (à 500 m près) : la sortie est déjà dans les références. */
export function isAlreadyReference(a: StravaActivity, refs: Reference[]): boolean {
  return refs.some((r) => r.date === a.date && Math.abs(r.km - a.distanceKm) < 0.5);
}

/**
 * Temps retenu d'une sortie : le temps de déplacement (pauses exclues), ou le temps écoulé quand Strava
 * n'en a pas (activité saisie à la main).
 */
export function activityTime(a: StravaActivity): string {
  return a.movingTime && durationMinutes(a.movingTime) > 0 ? a.movingTime : a.elapsedTime;
}

export function activityToReference(a: StravaActivity, kind: ReferenceKind, now = new Date()): Reference {
  return {
    strava: { id: a.id, checkedAt: now.toISOString() },
    label: a.name || `${SPORT_LABELS[a.sportType] ?? 'Sortie'} du ${a.date}`,
    date: a.date,
    kind,
    km: a.distanceKm,
    gainM: Math.round(a.elevationGainM),
    time: activityTime(a),
  };
}

/** Date d'il y a {@code weeks} semaines, au format "2026-07-22". */
export function weeksAgo(weeks: number, today = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Sorties du bloc de préparation (de {@code start} inclus à {@code end} exclu) et sorties plus anciennes. */
export function splitByBlock(activities: StravaActivity[], start: string, end = '9999-12-31') {
  return {
    block: activities.filter((a) => a.date >= start && a.date < end),
    older: activities.filter((a) => a.date < start),
  };
}

export interface BlockSummary {
  sessions: number;
  km: number;
  gainM: number;
  kmPerWeek: number;
  longest: StravaActivity | null;
}

/** Volume du bloc de préparation, pour le montrer au coureur. */
export function blockSummary(block: StravaActivity[], weeks: number): BlockSummary {
  const km = block.reduce((t, a) => t + a.distanceKm, 0);
  const gainM = block.reduce((t, a) => t + a.elevationGainM, 0);
  const longest = block.reduce<StravaActivity | null>(
    (best, a) => (!best || effort(a.distanceKm, a.elevationGainM) > effort(best.distanceKm, best.elevationGainM) ? a : best), null);
  return { sessions: block.length, km, gainM, kmPerWeek: km / weeks, longest };
}

/** Nombre de sorties d'entraînement du bloc proposées d'office comme références. */
export const KEY_TRAININGS = 3;

/**
 * Sorties du bloc qui valent une référence : ses courses, et les {@link KEY_TRAININGS} sorties
 * d'entraînement qui ressemblent le plus à la course (les plus longues, à défaut de course préparée).
 * Les footings n'en font pas partie : ils mesurent la forme, pas l'allure de course.
 */
export function keySessions(block: StravaActivity[], target: Target | null, existing: Reference[] = []): StravaActivity[] {
  const fresh = block.filter((a) => !isAlreadyReference(a, existing));
  const races = fresh.filter((a) => a.race);
  const trainings = fresh.filter((a) => !a.race);
  const ranked = target
    ? sortActivities(trainings, target)
    : [...trainings].sort((a, b) => effort(b.distanceKm, b.elevationGainM) - effort(a.distanceKm, a.elevationGainM));
  return sortActivities([...races, ...ranked.slice(0, KEY_TRAININGS)], null);
}

/** Date d'il y a {@code years} ans, au format "2024-10-12". */
export function yearsAgo(years: number, today = new Date()): string {
  const d = new Date(today);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Message à afficher au retour de la page d'autorisation de Strava (?strava=…). */
export function connectionMessage(result: string | null): { ok: boolean; text: string } | null {
  switch (result) {
    case 'connected': return { ok: true, text: 'Compte Strava connecté.' };
    case 'denied': return { ok: false, text: "Connexion annulée : l'accès à Strava n'a pas été autorisé." };
    case 'scope': return { ok: false, text: "Coche « Voir les données de tes activités » sur la page de Strava pour pouvoir les importer." };
    case 'error': return { ok: false, text: "Strava n'a pas confirmé la connexion : réessaie." };
    default: return null;
  }
}

/** La référence d'exemple proposée au premier lancement (60 km, 3 200 m D+, 8h48), sans nom ni date. */
export function isExampleReference(ref: Reference): boolean {
  return !ref.label.trim() && !ref.date && ref.km === 60 && ref.gainM === 3200 && durationMinutes(ref.time) === 528;
}

/**
 * La course d'exemple ne sert qu'en attendant les tiennes : dès qu'il y a une vraie référence, elle est retirée (elle
 * fausserait le plan si on oubliait de la supprimer).
 */
export function withoutExample(refs: Reference[]): Reference[] {
  return refs.some((r) => !isExampleReference(r)) ? refs.filter((r) => !isExampleReference(r)) : refs;
}
