import { describe, expect, it } from 'vitest';
import type { CourseView, RacePlan, RaceReview } from '../api/types';
import { compareRace, elapsedAt } from './review';
import { appliedProfile, racesFatigue } from './runner';

const review: RaceReview = {
  activityId: 1, fatigueExponent: 1.1, distanceKm: 20.2, elapsedMinutes: 130, movingMinutes: 120,
  points: Array.from({ length: 203 }, (_, i) => [i / 10, i * 0.6, i * 0.58] as [number, number, number]),
};

describe('retour de course', () => {
  it('interpole le temps écoulé tous les 100 m', () => {
    expect(elapsedAt(review, 5.05)).toBeCloseTo(30.3);
    expect(elapsedAt(review, 25)).toBeNull();
  });

  it('compare le plan et la course, à la distance de la montre', () => {
    const eta = (name: string, km: number, arrival: string) => ({ name, km, arrival } as RacePlan['checkpoints'][number]);
    const plan = { start: '2026-10-24T08:00:00', totalDistanceKm: 20,
      checkpoints: [eta('Départ', 0, '2026-10-24T08:00:00'), eta('Ravito', 10, '2026-10-24T09:00:00'), eta('Arrivée', 20, '2026-10-24T10:10:00')] } as RacePlan;
    const course = { track: { distanceKm: 20 }, markers: [{ trackKm: 0 }, { trackKm: 10 }, { trackKm: 20 }] } as unknown as CourseView;
    const rows = compareRace(plan, course, review);
    expect(rows.map((r) => r.planned)).toEqual([0, 60, 130]);
    // Ravito à mi-parcours de la trace : km 10,1 de la montre (20,2 km au total).
    expect(rows[1].actual).toBeCloseTo(60.6);
    expect(rows[2].actual).toBe(130);
  });

  it('tire la fatigue des courses comptées, rapprochée du coureur moyen', () => {
    expect(racesFatigue([])).toBeNull();
    expect(racesFatigue([{ fatigueExponent: 1.13, use: true }])).toBe(1.1);
    expect(racesFatigue([{ fatigueExponent: 1.13, use: false }, { fatigueExponent: null, use: true }])).toBeNull();
    expect(racesFatigue([{ fatigueExponent: 1.13, use: true }, { fatigueExponent: 1.1, use: true }])).toBeCloseTo(1.1);
  });

  it('envoie la pente du profil et la fatigue des courses', () => {
    const profile = { slope: [{ grade: 0.1, ratio: 0.8, km: 30 }], fatigueExponent: 1.07, activities: 15, km: 600,
      longActivities: 15, from: null, to: null };
    expect(appliedProfile({ profile, use: false, races: [] })).toBeNull();
    expect(appliedProfile({ profile, use: true, races: [] })?.fatigueExponent).toBe(1.07);
    expect(appliedProfile({ profile, use: true, races: [{ fatigueExponent: 1.13, use: true }] })?.fatigueExponent).toBe(1.1);
    const racesOnly = appliedProfile({ profile: null, use: true, races: [{ fatigueExponent: 1.13, use: true }] });
    expect(racesOnly?.slope).toEqual([]);
    expect(appliedProfile({ profile: null, use: true, races: [] })).toBeNull();
  });
});
