import type { CourseView, ElevationSource, RacePlan, Reference } from './types';

export class ApiError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
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
 * Dernier plan consulté, gardé dans le navigateur pour le jour J (pas de réseau en montagne).
 * Le service worker garde aussi les réponses de l'API, mais seulement pour la même URL :
 * cette copie-ci survit à un changement de référence.
 */
export interface Snapshot {
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
