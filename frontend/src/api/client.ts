import type {
  CourseView, ElevationSource, ExtractedGear, ExtractedRoadbook, ExtractorStatus, RaceDefinition, RacePlan, Reference,
  StravaActivity, StravaStatus,
} from './types';
import type { NightWindow } from '../lib/draft';

export class ApiError extends Error {}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    // Les erreurs de l'API sont des ProblemDetail : { detail: "..." }
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Erreur ${res.status} sur ${url}`);
  }
  return res.json() as Promise<T>;
}

export function fetchCourse(sampleId: string): Promise<CourseView> {
  return getJson(`/api/demo/${encodeURIComponent(sampleId)}/course?stepKm=0.1`);
}

/** Format attendu par l'API (fr.trailplanner.model.ReferencePerformance). */
function toApi(refs: Reference[]) {
  return refs.map((r, i) => ({
    label: r.label.trim() || `Référence ${i + 1}`,
    distanceKm: r.km,
    elevationGainM: r.gainM,
    duration: r.time,
    date: r.date,
    kind: r.kind,
  }));
}

export function fetchPlans(sampleId: string, refs: Reference[], source: ElevationSource): Promise<RacePlan[]> {
  return getJson(`/api/demo/${encodeURIComponent(sampleId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ references: toApi(refs), elevationSource: source }),
  });
}

/**
 * Plan d'une course chargée par le coureur : roadbook saisi + trace GPX optionnelle.
 * Une seule requête, pour n'envoyer la trace (plusieurs Mo) qu'une fois.
 */
export function fetchCustomPlans(
  race: RaceDefinition,
  night: NightWindow,
  gpx: File | null,
  refs: Reference[],
  source: ElevationSource,
): Promise<{ course: CourseView; plans: RacePlan[] }> {
  const request = {
    race,
    night,
    elevationSource: source,
    references: toApi(refs),
  };
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
  if (gpx) form.append('gpx', gpx);
  return getJson('/api/plans/full?stepKm=0.1', { method: 'POST', body: form });
}

export function fetchExtractorStatus(): Promise<ExtractorStatus> {
  return getJson('/api/roadbooks/extractor');
}

export function fetchStravaStatus(): Promise<StravaStatus> {
  return getJson('/api/strava/status');
}

/** Page à ouvrir pour connecter Strava : l'API renvoie vers Strava, qui revient ensuite sur l'appli. */
export function stravaConnectUrl(): string {
  return `/api/strava/authorize?origin=${encodeURIComponent(window.location.origin)}`;
}

/** Sorties de course à pied et de trail depuis une date ("2024-10-12"). */
export function fetchStravaActivities(after: string): Promise<StravaActivity[]> {
  return getJson(`/api/strava/activities?after=${encodeURIComponent(after)}`);
}

export async function disconnectStrava(): Promise<void> {
  const res = await fetch('/api/strava/connection', { method: 'DELETE' });
  if (!res.ok) throw new ApiError(`Erreur ${res.status} à la déconnexion de Strava`);
}

/** Lecture du roadbook (image ou PDF) par l'IA configurée côté serveur. Compter 30 s à 2 min en local. */
export function extractRoadbook(file: File): Promise<ExtractedRoadbook> {
  const form = new FormData();
  form.append('file', file);
  return getJson('/api/roadbooks/extract', { method: 'POST', body: form });
}

/** Lecture de la liste du matériel dans un règlement (image ou PDF), pour la course donnée. */
export function extractGear(file: File, raceName: string): Promise<ExtractedGear> {
  const form = new FormData();
  form.append('file', file);
  return getJson(`/api/gear/extract?raceName=${encodeURIComponent(raceName)}`, { method: 'POST', body: form });
}

/**
 * Dernier plan consulté, gardé dans le navigateur pour le jour J (pas de réseau en montagne).
 * Le service worker garde aussi les réponses de l'API, mais seulement pour la même URL :
 * cette copie-ci survit à un changement de référence.
 */
export interface Snapshot {
  /** Identifiant de l'exemple embarqué, ou "custom" pour ta course. */
  sampleId: string;
  references: Reference[];
  source: ElevationSource;
  course: CourseView;
  plans: RacePlan[];
  savedAt: string;
}

const SNAPSHOT_KEY = 'trail-planner:dernier-plan';

export function saveSnapshot(snapshot: Snapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Stockage plein ou désactivé (navigation privée) : tant pis, l'appli marche sans.
  }
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? migrateSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Les premières versions gardaient une seule référence, sans date ni type, et des plans sans « references ». */
export function migrateSnapshot(data: Snapshot & { reference?: Omit<Reference, 'label' | 'date' | 'kind'> }): Snapshot {
  const { reference, ...rest } = data;
  const references = rest.references ?? (reference ? [{ label: '', date: null, kind: 'RACE' as const, ...reference }] : []);
  return { ...rest, references, plans: rest.plans.map((p) => ({ ...p, references: p.references ?? [] })) };
}
