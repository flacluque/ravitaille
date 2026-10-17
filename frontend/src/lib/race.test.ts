import { describe, expect, it } from 'vitest';
import type { CheckpointEta, RacePlan } from '../api/types';
import { localMinutes } from './format';
import { adjustedArrival, adjustedMargin, formatDelay, isRaceWindow, offsetMinutes, raceProgress } from './race';

function eta(code: string, arrival: string, cutoffIn: string | null = null, marginIn: string | null = null): CheckpointEta {
  return {
    code, name: `P${code}`, km: 0, cumulativeGainM: 0, legDistanceKm: 10, legGainM: 300, legLossM: 200, legDuration: 'PT2H',
    legPaceMinPerKm: 12, arrival, elapsed: 'PT0S', stop: 'PT0S', departure: arrival, cutoffIn, cutoffOut: null, marginIn,
    marginOut: null, status: marginIn ? 'OK' : 'NONE', legNightDuration: 'PT0S',
  };
}

const plan = {
  start: '2026-10-23T11:00:00', finish: '2026-10-23T17:00:00',
  checkpoints: [
    eta('1P', '2026-10-23T11:00:00'),
    eta('2', '2026-10-23T13:00:00', '2026-10-23T14:30:00', 'PT1H30M'),
    eta('3', '2026-10-23T15:00:00', '2026-10-23T15:40:00', 'PT40M'),
    eta('1D', '2026-10-23T17:00:00'),
  ],
} as unknown as RacePlan;
const at = (iso: string) => localMinutes(iso);

describe('en course', () => {
  it('suit le plan à l\'horloge, sans recalage', () => {
    expect(raceProgress(plan, at('2026-10-23T09:00:00'), null)).toEqual({ phase: 'before', next: 0 });
    expect(raceProgress(plan, at('2026-10-23T12:10:00'), null)).toEqual({ phase: 'running', next: 1 });
    expect(raceProgress(plan, at('2026-10-23T14:00:00'), null)).toEqual({ phase: 'running', next: 2 });
    expect(raceProgress(plan, at('2026-10-23T18:00:00'), null)).toEqual({ phase: 'running', next: 3 });
    expect(raceProgress(plan, at('2026-10-24T00:00:00'), null).phase).toBe('finished');
  });

  it('décale la suite de l\'avance ou du retard pris au dernier point signalé', () => {
    const late = { index: 1, atMinutes: at('2026-10-23T13:25:00') };
    expect(offsetMinutes(plan, late)).toBe(25);
    expect(adjustedArrival(plan, 2, late)).toBe(at('2026-10-23T15:25:00'));
    expect(adjustedArrival(plan, 1, late)).toBe(at('2026-10-23T13:25:00'));
    expect(adjustedMargin(plan, 2, late)).toMatchObject({ minutes: 15, status: 'TIGHT' });
    expect(adjustedMargin(plan, 1, late)).toMatchObject({ minutes: 65, status: 'OK' });
    // Signalé au point 2 : le prochain est le 3, même si l'horloge dit autre chose.
    expect(raceProgress(plan, at('2026-10-23T13:30:00'), late).next).toBe(2);
    expect(adjustedMargin(plan, 2, { index: 1, atMinutes: at('2026-10-23T14:00:00') })?.status).toBe('MISSED');
    expect(raceProgress(plan, at('2026-10-23T17:10:00'), { index: 3, atMinutes: at('2026-10-23T17:05:00') }).phase).toBe('finished');
  });

  it('ouvre la vue course le jour J seulement', () => {
    expect(isRaceWindow(plan, at('2026-10-22T18:30:00'))).toBe(true);
    expect(isRaceWindow(plan, at('2026-10-22T12:00:00'))).toBe(false);
    expect(isRaceWindow(plan, at('2026-10-23T22:00:00'))).toBe(true);
    expect(isRaceWindow(plan, at('2026-10-24T08:00:00'))).toBe(false);
    expect(formatDelay(72)).toBe('1h12');
    expect(formatDelay(-25)).toBe('25 min');
  });
});
