import type { CourseView, ElevationSource, ExtractedRoadbook, ExtractorStatus, RaceDefinition, RacePlan, Reference } from './types';
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

export function fetchPlans(sampleId: string, ref: Reference, source: ElevationSource): Promise<RacePlan[]> {
  const params = new URLSearchParams({
    refKm: String(ref.km),
    refGain: String(ref.gainM),
    refTime: ref.time,
    source,
  });
  return getJson(`/api/demo/${encodeURIComponent(sampleId)}?${params}`);
}

/**
 * Plan d'une course chargée par le coureur : roadbook saisi + trace GPX optionnelle.
 * Une seule requête, pour n'envoyer la trace (plusieurs Mo) qu'une fois.
 */
export function fetchCustomPlans(
  race: RaceDefinition,
  night: NightWindow,
  gpx: File | null,
  ref: Reference,
  source: ElevationSource,
): Promise<{ course: CourseView; plans: RacePlan[] }> {
  const request = {
    race,
    night,
    elevationSource: source,
    references: [{ label: 'Référence', distanceKm: ref.km, elevationGainM: ref.gainM, duration: ref.time }],
  };
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
  if (gpx) form.append('gpx', gpx);
  return getJson('/api/plans/full?stepKm=0.1', { method: 'POST', body: form });
}

export function fetchExtractorStatus(): Promise<ExtractorStatus> {
  return getJson('/api/roadbooks/extractor');
}

/** Lecture du roadbook (image ou PDF) par l'IA configurée côté serveur. Compter 30 s à 2 min en local. */
export function extractRoadbook(file: File): Promise<ExtractedRoadbook> {
  const form = new FormData();
  form.append('file', file);
  return getJson('/api/roadbooks/extract', { method: 'POST', body: form });
}

/**
 * Dernier plan consulté, gardé dans le navigateur pour le jour J (pas de réseau en montagne).
 * Le service worker garde aussi les réponses de l'API, mais seulement pour la même URL :
 * cette copie-ci survit à un changement de référence.
 */
export interface Snapshot {
  /** Identifiant de l'exemple embarqué, ou "custom" pour ta course. */
  sampleId: string;
  reference: Reference;
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
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
