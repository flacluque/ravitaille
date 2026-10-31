import { normalizeDraft, type RaceDraft } from '../lib/draft';
import { plain, type GearItem } from '../lib/gear';
import type { ElevationSource, Reference, RunnerProfile, TrainingOptions } from './types';
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

/** Lecture, écriture et effacement d'une valeur dans IndexedDB (courses, traces, plans gardés). */
export function idbGet(key: string): Promise<unknown> {
  return withStore<unknown>('readonly', (s) => s.get(key));
}

export function idbPut(key: string, value: unknown): Promise<unknown> {
  return withStore<unknown>('readwrite', (s) => s.put(value, key) as IDBRequest<unknown>);
}

export function idbDelete(key: string): Promise<unknown> {
  return withStore<unknown>('readwrite', (s) => s.delete(key) as IDBRequest<unknown>);
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

/**
 * Trace gardée en octets, pas en File : Safari perd le contenu d'un fichier relu depuis IndexedDB et l'envoie vide au
 * serveur (le calcul était alors refusé sans explication).
 */
interface StoredGpx {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

function isStoredGpx(value: unknown): value is StoredGpx {
  return typeof value === 'object' && value !== null && (value as StoredGpx).bytes instanceof ArrayBuffer;
}

/**
 * Enregistre (ou efface, avec null) une trace GPX ; `key` : celle d'une course (api/races), sinon la trace unique des
 * premières versions. Les échecs sont silencieux.
 */
export async function saveGpx(file: File | null, key = GPX_KEY): Promise<void> {
  try {
    const value: StoredGpx | null = file ? { name: file.name, type: file.type, bytes: await file.arrayBuffer() } : null;
    await withStore<unknown>('readwrite', (s) => (value ? s.put(value, key) : s.delete(key)) as IDBRequest<unknown>);
  } catch {
    // IndexedDB indisponible : il faudra resélectionner la trace au prochain chargement.
  }
}

export async function loadGpx(key = GPX_KEY): Promise<File | null> {
  try {
    const value = await withStore<unknown>('readonly', (s) => s.get(key));
    if (isStoredGpx(value)) return new File([value.bytes], value.name || 'trace.gpx', { type: value.type });
    if (!(value instanceof Blob)) return null;
    // Trace gardée par une version précédente (un File) : relue tout de suite et gardée en octets. Illisible, elle est
    // rendue telle quelle, et le calcul demandera de la recharger.
    const file = value instanceof File ? value : new File([value], 'trace.gpx');
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength === 0 && file.size > 0) return file;
      const copy = new File([bytes], file.name, { type: file.type });
      void saveGpx(copy, key);
      return copy;
    } catch {
      return file;
    }
  } catch {
    return null;
  }
}

/**
 * Matériel, assistance et pointages du jour J : gardés course par course. La clé est l'identifiant de la course
 * (api/races), ou le nom de la course pour l'exemple et les données des premières versions.
 */
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

/**
 * Une course analysée (retour de course) : sa fatigue compte pour les plans suivants si le coureur le veut. Le nom, la
 * date et la distance sont ceux de la course du coureur (son plan), pas de l'activité Strava ; seuls l'identifiant de
 * l'activité (pour l'effacer si elle disparaît de Strava) et la fatigue mesurée viennent de Strava.
 */
export interface RaceResult {
  activityId: number;
  name: string;
  date: string;
  distanceKm: number;
  /** Fatigue mesurée (exposant de Riegel), null si la sortie est trop courte pour la mesurer. */
  fatigueExponent: number | null;
  /** Compter cette course pour la fatigue (à décocher pour une course perturbée : blessure, météo…). */
  use: boolean;
  /** Course de Ravitaille comparée (api/races), absente pour un retour enregistré par une version précédente. */
  raceId?: string;
}

export interface StoredRunnerProfile {
  /** Coût selon la pente, mesuré sur les sorties Strava (sa fatigue est celle du coureur moyen). */
  profile: RunnerProfile | null;
  /** Activités Strava d'où vient le profil : s'il en manque une sur Strava, le profil est effacé. */
  sources: number[];
  use: boolean;
  /** Date de la mesure (ISO). */
  measuredAt: string | null;
  /** Courses analysées : elles donnent la fatigue. */
  races: RaceResult[];
}

export const NO_RUNNER_PROFILE: StoredRunnerProfile = { profile: null, sources: [], use: false, measuredAt: null, races: [] };

export function loadRunnerProfile(): StoredRunnerProfile {
  try {
    const raw = localStorage.getItem(RUNNER_PROFILE_KEY);
    if (!raw) return NO_RUNNER_PROFILE;
    const saved = JSON.parse(raw) as Partial<StoredRunnerProfile>;
    const profile = saved.profile && Array.isArray(saved.profile.slope) && typeof saved.profile.fatigueExponent === 'number'
      ? saved.profile : null;
    const races = Array.isArray(saved.races) ? saved.races.filter((r) => r && typeof r.activityId === 'number') : [];
    // Profil d'une version qui ne gardait pas ses activités d'origine : on ne peut plus le relier à Strava, il est oublié.
    const sources = Array.isArray(saved.sources) ? saved.sources.filter((id) => typeof id === 'number') : [];
    const kept = profile && sources.length > 0 ? profile : null;
    return { profile: kept, sources: kept ? sources : [], use: (!!kept || races.length > 0) && saved.use !== false,
      measuredAt: kept ? saved.measuredAt ?? null : null, races };
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

// Marque de la montre choisie dans « Envoyer le plan sur ta montre » : Garmin (.fit et champ) ou une autre (.gpx).
const WATCH_KEY = 'trail-planner:montre';

export type WatchBrand = 'garmin' | 'other';

export function loadWatchBrand(): WatchBrand {
  try {
    return localStorage.getItem(WATCH_KEY) === 'other' ? 'other' : 'garmin';
  } catch {
    return 'garmin';
  }
}

export function saveWatchBrand(brand: WatchBrand): void {
  try {
    localStorage.setItem(WATCH_KEY, brand);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite.
  }
}

// Dernière vérification des données Strava gardées (voir lib/stravaData) : une fois par jour au plus.
const STRAVA_CHECK_KEY = 'trail-planner:strava-verifie';

export function loadStravaCheck(): string | null {
  try {
    return localStorage.getItem(STRAVA_CHECK_KEY);
  } catch {
    return null;
  }
}

export function saveStravaCheck(at: string | null): void {
  try {
    if (at) localStorage.setItem(STRAVA_CHECK_KEY, at);
    else localStorage.removeItem(STRAVA_CHECK_KEY);
  } catch {
    // Stockage indisponible : la vérification se refera à la prochaine ouverture.
  }
}

/** Donne à une course les données (matériel, assistance, pointages) gardées sous une autre clé, puis les y efface. */
export function moveRaceData(from: string, to: string): void {
  for (const key of [gearKey, crewKey, fixKey]) {
    try {
      const value = localStorage.getItem(key(from));
      if (value !== null && localStorage.getItem(key(to)) === null) localStorage.setItem(key(to), value);
      localStorage.removeItem(key(from));
    } catch {
      // stockage indisponible
    }
  }
}

/** Efface le matériel, l'assistance et les pointages d'une course supprimée. */
export function deleteRaceData(raceKey: string): void {
  for (const key of [gearKey, crewKey, fixKey]) {
    try {
      localStorage.removeItem(key(raceKey));
    } catch {
      // stockage indisponible
    }
  }
}

// Tes références (communes à toutes tes courses) et la source du dénivelé. Les premières versions les gardaient avec
// le dernier plan calculé.
const REFERENCES_KEY = 'trail-planner:references';

export function loadReferences(): { references: Reference[]; source: ElevationSource } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(REFERENCES_KEY) ?? 'null') as { references?: unknown; source?: unknown } | null;
    if (!raw || !Array.isArray(raw.references)) return null;
    const source = raw.source === 'ROADBOOK' || raw.source === 'TRACK' ? raw.source : 'AUTO';
    return { references: raw.references as Reference[], source };
  } catch {
    return null;
  }
}

export function saveReferences(references: Reference[], source: ElevationSource): void {
  try {
    localStorage.setItem(REFERENCES_KEY, JSON.stringify({ references, source }));
  } catch {
    // stockage indisponible
  }
}
