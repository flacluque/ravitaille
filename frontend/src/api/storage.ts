import { normalizeDraft, type RaceDraft } from '../lib/draft';

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
