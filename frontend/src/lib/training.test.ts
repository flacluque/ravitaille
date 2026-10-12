import { describe, expect, it } from 'vitest';
import { comparedReferences, formEffect, axisTicks, volumeChange, weekLabel } from './training';

describe('préparation', () => {
  it("formule l'effet de la forme et l'écart de volume", () => {
    expect(formEffect(0.969)).toBe('−3,1 %');
    expect(formEffect(1.08)).toBe('+8 %');
    expect(formEffect(1)).toBe('0 %');
    expect(volumeChange(55, 40)).toBe('+38 %');
    expect(volumeChange(30, 40)).toBe('−25 %');
  });

  it('garde les références dont la préparation est connue', () => {
    const base = { label: 'x', date: null, kind: 'RACE' as const, distanceKm: 1, elevationGainM: 0, duration: 'PT1H',
      weight: 1, recencyFactor: 1, distanceFactor: 1, predictedFinish: '', predictedDuration: '' };
    expect(comparedReferences([{ ...base, weeklyEffortKm: 40 }, { ...base, weeklyEffortKm: null }, base])).toHaveLength(1);
  });

  it("gradue l'axe et nomme les semaines", () => {
    expect(axisTicks(63)).toEqual([0, 50, 100]);
    expect(axisTicks(40)).toEqual([0, 20, 40]);
    expect(axisTicks(0)).toEqual([0, 10]);
    expect(weekLabel({ start: '2026-07-20', effortKm: 0, km: 0, gainM: 0, sessions: 0 })).toBe('20/07');
  });
});
