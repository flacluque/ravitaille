import type { Reference, ReferenceKind, StravaActivity } from '../api/types';

/** Distance et D+ de la course préparée, pour repérer les sorties qui lui ressemblent. */
export interface Target {
  km: number;
  gainM: number;
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

export function activityToReference(a: StravaActivity, kind: ReferenceKind): Reference {
  return {
    label: a.name || `${SPORT_LABELS[a.sportType] ?? 'Sortie'} du ${a.date}`,
    date: a.date,
    kind,
    km: a.distanceKm,
    gainM: Math.round(a.elevationGainM),
    time: a.elapsedTime,
  };
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
