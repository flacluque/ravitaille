import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';
import { appHeaders, handleAppLink, isNativeApp, rememberFromResponse } from './platform';
import { saveFile } from '../lib/files';

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
    expect(handleAppLink('ravitaille://strava?strava=connected&session=abc%2B1')).toBe('connected');
    expect(appHeaders()['X-Ravitaille-Strava']).toBe('abc+1');
    expect(handleAppLink('ravitaille://strava?strava=denied')).toBe('denied');
    expect(handleAppLink('ravitaille://autre?x=1')).toBeNull();
  });

  it('garde la connexion renouvelée, oubliée, et le code d\'accès', () => {
    rememberFromResponse(new Headers({ 'X-Ravitaille-Strava': 'nouvelle', 'X-Ravitaille-Access': 'signe' }));
    expect(appHeaders()).toEqual({ 'X-Ravitaille-Strava': 'nouvelle', 'X-Ravitaille-Access': 'signe' });
    rememberFromResponse(new Headers({ 'X-Ravitaille-Strava': '' }));
    expect(appHeaders()['X-Ravitaille-Strava']).toBe('');
    expect(appHeaders()['X-Ravitaille-Access']).toBe('signe');
  });

  it("n'ajoute les en-têtes que dans l'appli", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: new Headers(init.headers) });
      return new Response('{}', { headers: { 'X-Ravitaille-Strava': 'renouvelee' } });
    });
    store.set('trail-planner:app-strava', 'chiffree');
    await apiFetch('/api/strava/status');
    expect(calls[0].headers.has('X-Ravitaille-Strava')).toBe(false);
    expect(store.get('trail-planner:app-strava')).toBe('chiffree');

    inApp();
    await apiFetch('/api/strava/status');
    expect(calls[1].headers.get('X-Ravitaille-Strava')).toBe('chiffree');
    expect(store.get('trail-planner:app-strava')).toBe('renouvelee');
  });

  it("partage les fichiers dans l'appli", async () => {
    inApp();
    const shared: ShareData[] = [];
    vi.stubGlobal('navigator', { canShare: () => true, share: async (d: ShareData) => void shared.push(d) });
    expect(await saveFile(new Blob(['x']), 'course.fit', 'Parcours')).toBe('shared');
    expect(shared[0].files?.[0].name).toBe('course.fit');
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new DOMException('fermé', 'AbortError'); } });
    expect(await saveFile(new Blob(['x']), 'course.fit')).toBe('cancelled');
  });
});
