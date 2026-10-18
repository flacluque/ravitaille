import { describe, expect, it } from 'vitest';
import type { Marker, RacePlan } from '../api/types';
import { nightSpans } from './plan';

const leg = (duration: number, night: number) => ({ legDuration: `PT${duration}M`, legNightDuration: `PT${night}M` });

describe('nightSpans', () => {
  it('place la tombée de la nuit en fin de tronçon et fusionne les tronçons de nuit', () => {
    const plan = { checkpoints: [leg(0, 0), leg(60, 0), leg(100, 25), leg(80, 80), leg(60, 30)] } as unknown as RacePlan;
    const markers = [0, 10, 20, 30, 40].map((trackKm) => ({ trackKm })) as Marker[];
    expect(nightSpans(plan, markers)).toEqual([[17.5, 35]]);
  });
});
