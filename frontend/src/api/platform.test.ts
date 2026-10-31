import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';
import { appHeaders, handleAppLink, isNativeApp, rememberFromResponse } from './platform';
import { saveFile } from '../lib/files';

// Fichiers et feuille de partage d'iOS simulés.
const written: { path: string; data: string }[] = [];
let shareResult: () => Promise<void> = async () => undefined;
const sharedFiles: string[][] = [];
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: async (o: { path: string; data: string }) => { written.push(o); return { uri: `file:///cache/${o.path}` }; } },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: async (o: { files: string[] }) => { sharedFiles.push(o.files); return shareResult(); } },
}));

// Stockage du navigateur et Capacitor simulés (les tests tournent sous Node).
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  store.clear();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

afterEach(() => {
  delete g.Capacitor;
  delete g.localStorage;
  vi.unstubAllGlobals();
});

const inApp = () => { g.Capacitor = { isNativePlatform: () => true }; };

describe("appli mobile : connexions dans les en-têtes", () => {
  it('reconnaît l\'appli', () => {
    expect(isNativeApp()).toBe(false);
    inApp();
    expect(isNativeApp()).toBe(true);
  });

  it('garde la connexion Strava du lien de retour, et ignore les autres liens', () => {
    expect(handleAppLink('ravitime://strava?strava=connected&session=abc%2B1')).toBe('connected');
    expect(appHeaders()['X-Ravitime-Strava']).toBe('abc+1');
    expect(handleAppLink('ravitime://strava?strava=denied')).toBe('denied');
    expect(handleAppLink('ravitime://autre?x=1')).toBeNull();
  });

  it('garde la connexion renouvelée, oubliée, et le code d\'accès', () => {
    rememberFromResponse(new Headers({ 'X-Ravitime-Strava': 'nouvelle', 'X-Ravitime-Access': 'signe' }));
    expect(appHeaders()).toEqual({ 'X-Ravitime-Strava': 'nouvelle', 'X-Ravitime-Access': 'signe' });
    rememberFromResponse(new Headers({ 'X-Ravitime-Strava': '' }));
    expect(appHeaders()['X-Ravitime-Strava']).toBe('');
    expect(appHeaders()['X-Ravitime-Access']).toBe('signe');
  });

  it("n'ajoute les en-têtes que dans l'appli", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: new Headers(init.headers) });
      return new Response('{}', { headers: { 'X-Ravitime-Strava': 'renouvelee' } });
    });
    store.set('trail-planner:app-strava', 'chiffree');
    await apiFetch('/api/strava/status');
    expect(calls[0].headers.has('X-Ravitime-Strava')).toBe(false);
    expect(store.get('trail-planner:app-strava')).toBe('chiffree');

    inApp();
    await apiFetch('/api/strava/status');
    expect(calls[1].headers.get('X-Ravitime-Strava')).toBe('chiffree');
    expect(store.get('trail-planner:app-strava')).toBe('renouvelee');
  });

  it("partage les fichiers dans l'appli", async () => {
    inApp();
    expect(await saveFile(new Blob(['xyz']), 'course.fit', 'Parcours')).toBe('shared');
    expect(written[0]).toEqual({ path: 'course.fit', data: btoa('xyz'), directory: 'CACHE' });
    expect(sharedFiles[0]).toEqual(['file:///cache/course.fit']);
    shareResult = async () => { throw new Error('Share canceled'); };
    expect(await saveFile(new Blob(['x']), 'course.fit')).toBe('cancelled');
  });
});
