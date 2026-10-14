import { describe, expect, it } from 'vitest';
import type { StravaActivity } from '../api/types';
import {
  activityToReference, blockSummary, closest, closeness, connectionMessage, filterActivities, isAlreadyReference, keySessions,
  sortActivities, splitByBlock, weeksAgo, yearsAgo,
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

describe('bloc de préparation', () => {
  const today = new Date('2026-10-14T12:00:00Z');
  const acts = [
    act(10, '2026-10-10', 10, 100), act(11, '2026-10-05', 32, 1500), act(12, '2026-09-20', 25, 900, true),
    act(13, '2026-09-01', 38, 2100), act(14, '2026-08-10', 12, 200), act(15, '2026-07-25', 28, 1400),
    act(16, '2026-04-12', 60.4, 3210, true), act(17, '2026-03-01', 15, 100),
  ];

  it('sépare les 12 dernières semaines des sorties plus anciennes', () => {
    expect(weeksAgo(12, today)).toBe('2026-07-22');
    const { block, older } = splitByBlock(acts, weeksAgo(12, today));
    expect(block.map((a) => a.id)).toEqual([10, 11, 12, 13, 14, 15]);
    expect(older.map((a) => a.id)).toEqual([16, 17]);
    expect(splitByBlock(acts, weeksAgo(10, today)).block.map((a) => a.id)).toEqual([10, 11, 12, 13, 14]);
  });

  it('résume le volume du bloc', () => {
    const { block } = splitByBlock(acts, weeksAgo(12, today));
    const s = blockSummary(block, 12);
    expect(s.sessions).toBe(6);
    expect(s.km).toBeCloseTo(145);
    expect(s.gainM).toBe(6200);
    expect(s.kmPerWeek).toBeCloseTo(145 / 12);
    expect(s.longest?.id).toBe(13);
    expect(blockSummary([], 12).longest).toBeNull();
  });

  it('propose les courses du bloc et les 3 sorties qui ressemblent le plus à la course, pas les footings', () => {
    const { block } = splitByBlock(acts, weeksAgo(12, today));
    expect(keySessions(block, troubadours).map((a) => a.id)).toEqual([11, 12, 13, 15]);
    expect(keySessions(block, null).map((a) => a.id)).toEqual([11, 12, 13, 15]);
    const existing = [activityToReference(act(13, '2026-09-01', 38, 2100), 'TRAINING')];
    expect(keySessions(block, troubadours, existing).map((a) => a.id)).toEqual([11, 12, 14, 15]);
  });
});
