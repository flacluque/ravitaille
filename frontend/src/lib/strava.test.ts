import { describe, expect, it } from 'vitest';
import type { StravaActivity } from '../api/types';
import {
  activityToReference, closest, closeness, connectionMessage, filterActivities, isAlreadyReference, sortActivities, yearsAgo,
} from './strava';

const act = (id: number, date: string, km: number, gain: number, race = false): StravaActivity => ({
  id, name: `Sortie ${id}`, date, sportType: 'TrailRun', distanceKm: km, elevationGainM: gain,
  elapsedTime: 'PT8H48M', movingTime: 'PT8H10M', race,
});

const cathares = act(1, '2026-04-12', 60.4, 3210, true);
const footing = act(2, '2026-09-30', 10, 100);
const longue = act(3, '2026-08-15', 35, 1800);
const troubadours = { km: 88, gainM: 3426 };

describe('import Strava', () => {
  it('mesure la ressemblance avec la course en km-effort', () => {
    expect(closeness(act(9, '2026-01-01', 88, 3426), troubadours)).toBe(1);
    expect(closeness(cathares, troubadours)).toBeGreaterThan(closeness(longue, troubadours));
    expect(closeness(longue, troubadours)).toBeGreaterThan(closeness(footing, troubadours));
  });

  it('trie par ressemblance, ou par date sans course préparée', () => {
    expect(sortActivities([footing, longue, cathares], troubadours).map((a) => a.id)).toEqual([1, 3, 2]);
    expect(sortActivities([cathares, longue, footing], null).map((a) => a.id)).toEqual([2, 3, 1]);
    expect([...closest([footing, longue, cathares], troubadours, 2)]).toEqual([1, 3]);
    expect(closest([footing], null).size).toBe(0);
  });

  it('filtre par distance et sur les courses', () => {
    expect(filterActivities([cathares, footing, longue], { minKm: 20, racesOnly: false }).map((a) => a.id)).toEqual([1, 3]);
    expect(filterActivities([cathares, footing, longue], { minKm: 0, racesOnly: true }).map((a) => a.id)).toEqual([1]);
  });

  it('fait une référence, temps arrêts compris', () => {
    expect(activityToReference(cathares, 'RACE')).toEqual({
      label: 'Sortie 1', date: '2026-04-12', kind: 'RACE', km: 60.4, gainM: 3210, time: 'PT8H48M',
    });
    expect(activityToReference({ ...footing, name: '' }, 'TRAINING').label).toBe('Trail du 2026-09-30');
  });

  it('reconnaît une sortie déjà dans les références', () => {
    const refs = [activityToReference(cathares, 'RACE')];
    expect(isAlreadyReference({ ...cathares, distanceKm: 60.1 }, refs)).toBe(true);
    expect(isAlreadyReference(footing, refs)).toBe(false);
  });

  it('calcule la date de début par défaut et les messages de retour', () => {
    expect(yearsAgo(2, new Date('2026-10-12T10:00:00Z'))).toBe('2024-10-12');
    expect(connectionMessage('connected')?.ok).toBe(true);
    expect(connectionMessage('denied')?.ok).toBe(false);
    expect(connectionMessage(null)).toBeNull();
  });
});
