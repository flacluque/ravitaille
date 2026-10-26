import { normalizeDraft, type RaceDraft } from '../lib/draft';
import { plain, type GearItem } from '../lib/gear';
import type { RunnerProfile, TrainingOptions } from './types';
import { DEFAULT_PROFILE, normalizeProfile, type NutritionProfile } from '../lib/nutrition';

// Ta course reste dans ton navigateur : le roadbook (petit) dans localStorage, la trace GPX
// (plusieurs Mo, au-delà du quota de localStorage) dans IndexedDB.

const DRAFT_KEY = 'trail-planner:ma-course';

export function saveDraft(draft: RaceDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Navigation privée ou stockage plein : la saisie reste valable pour la session.
  }
}

export function loadDraft(): RaceDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? normalizeDraft(JSON.parse(raw) as RaceDraft) : null;
  } catch {
    return null;
  }
}

const DB_NAME = 'trail-planner';
const STORE = 'fichiers';
const GPX_KEY = 'ma-trace';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Enregistre (ou efface, avec null) la trace GPX de ta course. Les échecs sont silencieux. */
export async function saveGpx(file: File | null): Promise<void> {
  try {
    await withStore<unknown>('readwrite', (s) => (file ? s.put(file, GPX_KEY) : s.delete(GPX_KEY)) as IDBRequest<unknown>);
  } catch {
    // IndexedDB indisponible : il faudra resélectionner la trace au prochain chargement.
  }
}

export async function loadGpx(): Promise<File | null> {
  try {
    const value = await withStore<unknown>('readonly', (s) => s.get(GPX_KEY));
    return value instanceof File ? value : value instanceof Blob ? new File([value], 'trace.gpx') : null;
  } catch {
    return null;
  }
}

/** Checklist du matériel, une par course (clé : nom de la course). */
function gearKey(raceName: string): string {
  return `trail-planner:materiel:${plain(raceName)}`;
}

export function loadGear(raceName: string): GearItem[] {
  try {
    const raw = localStorage.getItem(gearKey(raceName));
    return raw ? (JSON.parse(raw) as GearItem[]) : [];
  } catch {
    return [];
  }
}

export function saveGear(raceName: string, items: GearItem[]): void {
  try {
    localStorage.setItem(gearKey(raceName), JSON.stringify(items));
  } catch {
    // stockage indisponible : la liste vaut pour la session
  }
}

const TRAINING_KEY = 'trail-planner:entrainement';
/** Par défaut : l'entraînement Strava compte (s'il est connecté), randonnées comprises. */
export const DEFAULT_TRAINING: TrainingOptions = { strava: true, includeHikes: true, weeks: 12 };
export const MIN_PREP_WEEKS = 10;
export const MAX_PREP_WEEKS = 16;

export function loadTrainingOptions(): TrainingOptions {
  try {
    const raw = localStorage.getItem(TRAINING_KEY);
    if (!raw) return DEFAULT_TRAINING;
    const saved = { ...DEFAULT_TRAINING, ...(JSON.parse(raw) as Partial<TrainingOptions>) };
    const weeks = Math.round(Number(saved.weeks));
    return { ...saved, weeks: weeks >= MIN_PREP_WEEKS && weeks <= MAX_PREP_WEEKS ? weeks : DEFAULT_TRAINING.weeks };
  } catch {
    return DEFAULT_TRAINING;
  }
}

export function saveTrainingOptions(options: TrainingOptions): void {
  try {
    localStorage.setItem(TRAINING_KEY, JSON.stringify(options));
  } catch {
    // stockage indisponible : l'option vaut pour la session
  }
}

const NUTRITION_KEY = 'trail-planner:nutrition';

/** Profil nutrition, repris d'une version précédente si besoin (anciens types de produits…). */
export function loadNutrition(): NutritionProfile {
  try {
    const raw = localStorage.getItem(NUTRITION_KEY);
    return raw ? normalizeProfile(JSON.parse(raw)) : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveNutrition(profile: NutritionProfile): void {
  try {
    localStorage.setItem(NUTRITION_KEY, JSON.stringify(profile));
  } catch {
    // stockage indisponible : le profil vaut pour la session
  }
}

const crewKey = (raceName: string) => `trail-planner:assistance:${plain(raceName)}`;

/** Codes des points où l'assistance attend le coureur, pour cette course. */
export function loadCrew(raceName: string): string[] {
  try {
    const raw = localStorage.getItem(crewKey(raceName));
    const codes = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(codes) ? codes.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCrew(raceName: string, codes: string[]): void {
  try {
    localStorage.setItem(crewKey(raceName), JSON.stringify(codes));
  } catch {
    // stockage indisponible
  }
}

const fixKey = (raceName: string) => `trail-planner:en-course:${plain(raceName)}`;

/** Dernier point où le coureur s'est signalé pendant la course (recalage), pour ce départ. */
export function loadFix(raceName: string, start: string): { index: number; atMinutes: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(fixKey(raceName)) ?? 'null') as { index?: unknown; atMinutes?: unknown; start?: unknown } | null;
    return raw && raw.start === start && typeof raw.index === 'number' && typeof raw.atMinutes === 'number'
      ? { index: raw.index, atMinutes: raw.atMinutes } : null;
  } catch {
    return null;
  }
}

export function saveFix(raceName: string, start: string, fix: { index: number; atMinutes: number } | null): void {
  try {
    if (fix) localStorage.setItem(fixKey(raceName), JSON.stringify({ ...fix, start }));
    else localStorage.removeItem(fixKey(raceName));
  } catch {
    // stockage indisponible : le recalage vaut pour la session
  }
}

const RUNNER_KEY = 'trail-planner:prenom';

/** Prénom du coureur, montré à son assistance. */
export function loadRunnerName(): string {
  try {
    return localStorage.getItem(RUNNER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveRunnerName(name: string): void {
  try {
    localStorage.setItem(RUNNER_KEY, name.trim());
  } catch {
    // stockage indisponible
  }
}

// Profil personnel du coureur (pente et fatigue, mesuré sur Strava) : gardé dans le navigateur et envoyé avec chaque
// calcul de sa course quand il choisit de l'utiliser.
const RUNNER_PROFILE_KEY = 'trail-planner:profil-coureur';

/** Une course analysée (retour de course) : sa fatigue compte pour les plans suivants si le coureur le veut. */
export interface RaceResult {
  activityId: number;
  name: string;
  date: string;
  distanceKm: number;
  /** Fatigue mesurée (exposant de Riegel), null si la sortie est trop courte pour la mesurer. */
  fatigueExponent: number | null;
  /** Compter cette course pour la fatigue (à décocher pour une course perturbée : blessure, météo…). */
  use: boolean;
}

export interface StoredRunnerProfile {
  /** Coût selon la pente, mesuré sur les sorties Strava (sa fatigue est celle du coureur moyen). */
  profile: RunnerProfile | null;
  use: boolean;
  /** Date de la mesure (ISO). */
  measuredAt: string | null;
  /** Courses analysées : elles donnent la fatigue. */
  races: RaceResult[];
}

export const NO_RUNNER_PROFILE: StoredRunnerProfile = { profile: null, use: false, measuredAt: null, races: [] };

export function loadRunnerProfile(): StoredRunnerProfile {
  try {
    const raw = localStorage.getItem(RUNNER_PROFILE_KEY);
    if (!raw) return NO_RUNNER_PROFILE;
    const saved = JSON.parse(raw) as Partial<StoredRunnerProfile>;
    const profile = saved.profile && Array.isArray(saved.profile.slope) && typeof saved.profile.fatigueExponent === 'number'
      ? saved.profile : null;
    const races = Array.isArray(saved.races) ? saved.races.filter((r) => r && typeof r.activityId === 'number') : [];
    return { profile, use: (!!profile || races.length > 0) && saved.use !== false, measuredAt: saved.measuredAt ?? null, races };
  } catch {
    return NO_RUNNER_PROFILE;
  }
}

export function saveRunnerProfile(stored: StoredRunnerProfile): void {
  try {
    if (stored.profile || stored.races.length > 0) localStorage.setItem(RUNNER_PROFILE_KEY, JSON.stringify(stored));
    else localStorage.removeItem(RUNNER_PROFILE_KEY);
  } catch {
    // Stockage indisponible : le profil vaut pour cette visite seulement.
  }
}
