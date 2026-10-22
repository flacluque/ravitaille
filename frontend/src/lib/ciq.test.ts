import { describe, expect, it } from 'vitest';
import type { CourseView, RacePlan } from '../api/types';
import fixture from './__fixtures__/bogomiles-plan.json';
import { buildCiqPlan, ciqGap, ciqNext, decodeCiqPlan, encodeCiqPlan, type CiqPlan } from './ciq';

const course = fixture.course as unknown as CourseView;
const plans = fixture.plans as unknown as RacePlan[];

describe('plan pour le champ Connect IQ', () => {
  const plan = buildCiqPlan(course, plans[1])!;

  it('tient dans un code court, relu à l\'identique', () => {
    const code = encodeCiqPlan(plan);
    expect(code.startsWith('TP1;660;')).toBe(true);
    expect(code.length).toBeLessThan(1000);
    const back = decodeCiqPlan(code)!;
    expect(back.ravitos.map((r) => r.name)).toEqual(plan.ravitos.map((r) => r.name));
    expect(back.ravitos[0].name).toBe('Départ');
    expect(back.ravitos.at(-1)!.name).toBe('Arrivée');
    expect(back.ravitos.find((r) => r.name === 'Molières')).toBeDefined();
    expect(decodeCiqPlan('TP2;0;0;x')).toBeNull();
    expect(decodeCiqPlan('n\'importe quoi')).toBeNull();
  });

  it('donne l\'écart au plan : avance, retard, arrêt prévu au ravito', () => {
    const p: CiqPlan = {
      startClock: 600,
      effort: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      ravitos: [
        { name: 'Départ', km: 0, arr: 0, dep: 0, todo: [] },
        { name: 'R1', km: 5, arr: 50, dep: 60, todo: [] },
        { name: 'Arrivée', km: 10, arr: 110, dep: 110, todo: [] },
      ],
    };
    expect(ciqGap(p, 2.5, 25)).toBeCloseTo(0);
    expect(ciqGap(p, 2.5, 20)).toBeCloseTo(-5);
    expect(ciqGap(p, 5, 55)).toBe(0);
    expect(ciqGap(p, 5, 70)).toBe(10);
    expect(ciqGap(p, 7.5, 85)).toBeCloseTo(0);
    expect(ciqNext(p, 0)).toBe(1);
    expect(ciqNext(p, 5)).toBe(2);
    expect(ciqNext(p, 10)).toBe(2);
  });

  it('suit le terrain : une montée prend plus de temps qu\'un plat', () => {
    const p: CiqPlan = {
      startClock: 600,
      // 3 km de montée (400 m D+), puis 6 km de plat : 13 km-effort.
      effort: [0, 2.33, 4.67, 7, 8, 9, 10, 11, 12, 13],
      ravitos: [
        { name: 'Départ', km: 0, arr: 0, dep: 0, todo: [] },
        { name: 'Arrivée', km: 9, arr: 83, dep: 83, todo: [] },
      ],
    };
    // À 3 km, le plan prévoit 7/13 de 83 min, pas 3/9.
    expect(ciqGap(p, 3, 83 * 7 / 13)).toBeCloseTo(0);
    expect(ciqGap(p, 3, 28)).toBeLessThan(-15);
  });
});
