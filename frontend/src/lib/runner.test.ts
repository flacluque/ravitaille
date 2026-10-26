import { describe, expect, it } from 'vitest';
import type { ProfilePoint, RunnerProfile } from '../api/types';
import { runnerRatio, terrainEffortAt, terrainFactor } from './plan';
import { fatigueEffect, slopeLabel, slopeVerdict } from './runner';

const climber: RunnerProfile = {
  slope: [{ grade: -0.1, ratio: 1.2, km: 10 }, { grade: 0, ratio: 1, km: 20 }, { grade: 0.1, ratio: 0.8, km: 10 }],
  fatigueExponent: 1.1, activities: 6, km: 120, longActivities: 3, from: '2026-03-01', to: '2026-10-01',
};

describe('profil de coureur', () => {
  it('interpole le rapport au coût standard, constant au-delà des tranches mesurées', () => {
    expect(runnerRatio(climber, 0.05)).toBeCloseTo(0.9);
    expect(runnerRatio(climber, 0.3)).toBeCloseTo(0.8);
    expect(runnerRatio(climber, -0.4)).toBeCloseTo(1.2);
    expect(terrainFactor(0.1, climber)).toBeCloseTo(2 * 0.8);
    expect(terrainFactor(0.1)).toBeCloseTo(2);
  });

  it("garde l'effort cumulé de chaque profil à part", () => {
    // Une montée de 1 km à 10 %.
    const profile: ProfilePoint[] = Array.from({ length: 11 }, (_, i) => ({
      km: i / 10, elevationM: 100 + i * 10, cumulativeGainM: i * 10, cumulativeLossM: 0, lat: 43, lon: 2,
    }));
    expect(terrainEffortAt(profile, 1)).toBeCloseTo(2);
    expect(terrainEffortAt(profile, 1, climber)).toBeCloseTo(1.6);
    expect(terrainEffortAt(profile, 1)).toBeCloseTo(2);
  });

  it('dit le profil en phrases', () => {
    expect(slopeLabel(0.123)).toBe('+12 %');
    expect(slopeLabel(-0.08)).toBe('−8 %');
    expect(slopeVerdict(0.82)).toEqual({ text: '18 % plus rapide', tone: 'faster' });
    expect(slopeVerdict(1.15)).toEqual({ text: '15 % plus lent', tone: 'slower' });
    expect(slopeVerdict(1.01).tone).toBe('same');
    expect(fatigueEffect(1.07).longRacePercent).toBe(0);
    expect(fatigueEffect(1.17).longRacePercent).toBe(10);
    expect(fatigueEffect(1.17).verdict).toMatch(/plus que le coureur moyen/);
  });
});
