import { describe, expect, it } from 'vitest';
import { NO_RUNNER_PROFILE, type StoredRunnerProfile } from '../api/storage';
import type { Reference, RunnerProfile, StravaActivity } from '../api/types';
import { checkSince, checkStrava, expireReferences, holdsStravaData, needsCheck, purgeStrava, reconcile, reconcileNotice } from './stravaData';

const now = new Date('2026-10-31T10:00:00Z');
const activity = (id: number, over: Partial<StravaActivity> = {}): StravaActivity => ({
  id, name: `Sortie ${id}`, date: '2026-09-01', sportType: 'TrailRun', distanceKm: 30, elevationGainM: 1500,
  elapsedTime: 'PT4H', movingTime: 'PT3H50M', race: false, ...over,
});
const fromStrava = (id: number, checkedAt = '2026-10-30T10:00:00Z'): Reference => ({
  label: `Sortie ${id}`, date: '2026-09-01', kind: 'RACE', km: 30, gainM: 1500, time: 'PT3H50M', strava: { id, checkedAt },
});
const manual: Reference = { label: 'Cathares', date: '2026-05-01', kind: 'RACE', km: 60, gainM: 3000, time: 'PT9H' };
const profile = { slope: [], fatigueExponent: 1.07, activities: 2, km: 50, longActivities: 1, from: '2026-03-01', to: '2026-09-01' } as RunnerProfile;
const runner = (over: Partial<StoredRunnerProfile> = {}): StoredRunnerProfile => ({
  ...NO_RUNNER_PROFILE, profile, sources: [1, 2], use: true, measuredAt: '2026-10-01T00:00:00Z',
  races: [{ activityId: 3, name: 'Troubadours', date: '2026-10-23', distanceKm: 88, fatigueExponent: 1.11, use: true }], ...over,
});

describe('données Strava gardées par l\'appli', () => {
  it('met à jour les références depuis Strava et retire celles dont l\'activité a disparu', () => {
    const r = reconcile({ references: [manual, fromStrava(1), fromStrava(9)], runner: runner() },
      [activity(1, { distanceKm: 31 }), activity(2), activity(3)], now);
    expect(r.references).toHaveLength(2);
    expect(r.references[0]).toBe(manual);
    expect(r.references[1].km).toBe(31);
    expect(r.references[1].strava?.checkedAt).toBe(now.toISOString());
    expect(r.removedReferences).toBe(1);
    expect(r.changed).toBe(true);
    expect(r.profileRemoved).toBe(false);
  });

  it('efface le profil si une de ses activités a disparu, et la fatigue d\'une course supprimée', () => {
    const r = reconcile({ references: [], runner: runner() }, [activity(1)], now);
    expect(r.profileRemoved).toBe(true);
    expect(r.runner.profile).toBeNull();
    expect(r.runner.sources).toEqual([]);
    expect(r.removedRaces).toBe(1);
    expect(r.runner.races).toEqual([]);
    expect(r.runner.use).toBe(false);
  });

  it('retire, hors ligne, les références Strava non vérifiées depuis plus de 7 jours', () => {
    const { references, removed } = expireReferences([manual, fromStrava(1, '2026-10-20T10:00:00Z'), fromStrava(2)], now);
    expect(removed).toBe(1);
    expect(references.map((r) => r.strava?.id ?? null)).toEqual([null, 2]);
  });

  it('efface tout ce qui vient de Strava à la déconnexion', () => {
    expect(purgeStrava([manual, fromStrava(1)])).toEqual([manual]);
  });

  it('vérifie une fois par jour, depuis la plus ancienne donnée gardée', () => {
    expect(needsCheck(null, now)).toBe(true);
    expect(needsCheck('2026-10-31T01:00:00Z', now)).toBe(false);
    expect(needsCheck('2026-10-30T01:00:00Z', now)).toBe(true);
    expect(checkSince({ references: [manual, fromStrava(1)], runner: runner() }, now)).toBe('2026-02-28');
    expect(checkSince({ references: [manual], runner: NO_RUNNER_PROFILE }, now)).toBeNull();
    expect(holdsStravaData({ references: [manual], runner: NO_RUNNER_PROFILE })).toBe(false);
  });

  describe('vérification au lancement', () => {
    const held = { references: [fromStrava(1, '2026-10-20T10:00:00Z')], runner: runner() };
    const api = (status: { configured: boolean; connected: boolean } | Error, activities: StravaActivity[] | Error = []) => ({
      status: () => (status instanceof Error ? Promise.reject(status) : Promise.resolve(status)),
      activities: () => (activities instanceof Error ? Promise.reject(activities) : Promise.resolve(activities)),
    });

    it('ne revérifie pas dans la journée, ni quand rien ne vient de Strava', async () => {
      expect(await checkStrava(held, '2026-10-31T08:00:00Z', api({ configured: true, connected: true }), now)).toEqual({ kind: 'skip' });
      expect(await checkStrava({ references: [manual], runner: NO_RUNNER_PROFILE }, null, api({ configured: true, connected: true }), now))
        .toEqual({ kind: 'skip' });
    });

    it('efface tout quand Strava est déconnecté ou l\'accès révoqué', async () => {
      expect((await checkStrava(held, null, api({ configured: true, connected: false }), now)).kind).toBe('purge');
      const revoked = Object.assign(new Error('refusé'), { status: 401 });
      expect((await checkStrava(held, null, api({ configured: true, connected: true }, revoked), now)).kind).toBe('purge');
    });

    it('hors ligne, retire les références vérifiées il y a plus de 7 jours', async () => {
      const r = await checkStrava(held, null, api(new Error('réseau')), now);
      expect(r).toEqual({ kind: 'expired', references: [], removed: 1 });
    });

    it('vérifie sur Strava et dit ce qui a été effacé', async () => {
      const r = await checkStrava(held, null, api({ configured: true, connected: true }, [activity(1), activity(2)]), now);
      expect(r.kind).toBe('reconciled');
      if (r.kind !== 'reconciled') return;
      expect(r.result.references[0].strava?.checkedAt).toBe(now.toISOString());
      expect(reconcileNotice(r.result)).toBe(
        'Des activités ont été supprimées de ton compte Strava. Ravitaille a effacé ce qui en venait : 1 retour de course.');
      expect(reconcileNotice({ removedReferences: 0, profileRemoved: false, removedRaces: 0 })).toBeNull();
    });
  });
});
