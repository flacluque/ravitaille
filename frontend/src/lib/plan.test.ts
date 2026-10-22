import { describe, expect, it } from 'vitest';
import type { CheckpointEta, Marker, RacePlan } from '../api/types';
import { formatClockFromMinutes } from './format';
import { bindingCutoff, effortShare, estimatedMinutesAt, tightestCutoff, worstCutoff } from './plan';

function eta(partial: Partial<CheckpointEta>): CheckpointEta {
  return {
    code: 'X', name: 'X', km: 0, cumulativeGainM: 0, legDistanceKm: 0, legGainM: 0, legLossM: 0,
    legDuration: 'PT0S', legPaceMinPerKm: 0, arrival: '2026-10-23T11:00:00', elapsed: 'PT0S', stop: 'PT0S',
    departure: '2026-10-23T11:00:00', cutoffIn: null, cutoffOut: null, marginIn: null, marginOut: null,
    status: 'NONE', ...partial,
  };
}

const marker = (code: string, trackKm: number): Marker => ({
  code, name: code, km: trackKm, trackKm, lat: 0, lon: 0, elevationM: 0, aid: 'NONE',
});

function plan(checkpoints: CheckpointEta[]): RacePlan {
  return {
    raceName: 'Test', elevationSource: 'ROADBOOK', totalDistanceKm: 0, totalGainM: 0, totalEffortKm: 0,
    scenario: { name: 'Réaliste', paceFactor: 1, fatigueExponent: 1.07, nightFactor: 1.1, lightStopMinutes: 4, fullStopMinutes: 15 },
    start: '', finish: '', totalDuration: 'PT0S', totalStops: 'PT0S', nightDuration: 'PT0S', warnings: [], references: [], checkpoints,
  };
}

describe('barrières', () => {
  it("retient la plus serrée entre l'entrée et la sortie du ravito", () => {
    const e = eta({
      cutoffIn: '2026-10-23T21:00:00', marginIn: 'PT3H',
      cutoffOut: '2026-10-23T22:00:00', marginOut: 'PT2H27M',
    });
    expect(bindingCutoff(e)).toEqual({ at: '2026-10-23T22:00:00', marginMinutes: 147, out: true });
    expect(bindingCutoff(eta({}))).toBeNull();
  });

  it('trouve la barrière la plus serrée du plan, même dépassée', () => {
    const p = plan([
      eta({ code: 'A', cutoffIn: '2026-10-23T14:30:00', marginIn: 'PT58M', status: 'TIGHT' }),
      eta({ code: 'B', cutoffIn: '2026-10-23T17:30:00', marginIn: 'PT-12M', status: 'MISSED' }),
      eta({ code: 'C' }),
    ]);
    expect(tightestCutoff(p)?.eta.code).toBe('B');
  });

  it('trouve la marge la plus faible tous scénarios confondus', () => {
    const real = plan([eta({ code: 'A', cutoffIn: '2026-10-23T14:30:00', marginIn: 'PT1H4M', status: 'OK' })]);
    const prud = plan([eta({ code: 'A', cutoffIn: '2026-10-23T14:30:00', marginIn: 'PT58M', status: 'TIGHT' })]);
    expect(worstCutoff([real, real, prud])).toMatchObject({ scenario: 2, cutoff: { marginMinutes: 58 } });
    expect(worstCutoff([plan([eta({})])])).toBeNull();
  });
});

describe('heure estimée sur la trace', () => {
  const p = plan([
    eta({ code: 'D', departure: '2026-10-23T11:00:00' }),
    eta({ code: 'R', arrival: '2026-10-23T13:00:00', departure: '2026-10-23T13:10:00' }),
    eta({ code: 'A', arrival: '2026-10-23T15:10:00' }),
  ]);
  const markers = [marker('D', 0), marker('R', 20), marker('A', 40)];

  it('interpole entre le départ du ravito précédent et l\'arrivée au suivant', () => {
    expect(formatClockFromMinutes(estimatedMinutesAt(10, p, markers)!)).toBe('ven 12h00');
    expect(formatClockFromMinutes(estimatedMinutesAt(20, p, markers)!)).toBe('ven 13h00');
    expect(formatClockFromMinutes(estimatedMinutesAt(30, p, markers)!)).toBe('ven 14h10');
    expect(formatClockFromMinutes(estimatedMinutesAt(45, p, markers)!)).toBe('ven 15h10');
  });

  it('renonce si les ravitos ne correspondent pas au plan', () => {
    expect(estimatedMinutesAt(10, p, markers.slice(1))).toBeNull();
  });

  it('répartit le temps d\'un tronçon selon le terrain (km-effort), pas selon la distance', () => {
    // 9 km : 400 m de D+ sur les 3 premiers km, puis plat.
    const profile = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((km) => ({
      km, cumulativeGainM: Math.min(km, 3) * (400 / 3), cumulativeLossM: 0, elevationM: 0, lat: 0, lon: 0,
    }));
    expect(effortShare(3, 0, 9)).toBeCloseTo(3 / 9);
    expect(effortShare(3, 0, 9, profile)).toBeCloseTo(7 / 13);
    expect(effortShare(9, 0, 9, profile)).toBe(1);
    expect(effortShare(-1, 0, 9, profile)).toBe(0);
  });
});

