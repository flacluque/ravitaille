import { describe, expect, it } from 'vitest';
import type { CheckpointEta, RacePlan, Service } from '../api/types';
import {
  computeNutrition, DEFAULT_PROFILE, describeFill, describeItems, describeRhythm, normalizeProfile, type NutritionProfile,
} from './nutrition';

function eta(minutes: number, elapsed: number, nightMinutes = 0): CheckpointEta {
  return {
    code: '', name: '', km: 0, cumulativeGainM: 0, legDistanceKm: 0, legGainM: 0, legLossM: 0,
    legDuration: `PT${minutes}M`, legPaceMinPerKm: 0, arrival: '2026-10-23T09:00:00', elapsed: `PT${elapsed}M`, stop: 'PT0S',
    departure: '2026-10-23T09:00:00', cutoffIn: null, cutoffOut: null, marginIn: null, marginOut: null,
    status: 'NONE', legNightDuration: `PT${nightMinutes}M`,
  };
}

/** Un plan dont chaque tronçon dure [minutes, minutes de nuit] ; le code d'un point est son rang. */
function plan(...legs: [number, number?][]): RacePlan {
  let elapsed = 0;
  const etas = [eta(0, 0), ...legs.map(([m, n]) => { elapsed += m; return eta(m, elapsed, n ?? 0); })];
  const checkpoints = etas.map((e, i) => ({ ...e, code: String(i), name: `P${i}` }));
  return {
    raceName: 'Test', elevationSource: 'ROADBOOK', totalDistanceKm: 0, totalGainM: 0, totalEffortKm: 0,
    scenario: { name: 'Réaliste', paceFactor: 1, fatigueExponent: 1.07, nightFactor: 1.1, lightStopMinutes: 4, fullStopMinutes: 15 },
    start: '', finish: '', totalDuration: 'PT0S', totalStops: 'PT0S', nightDuration: 'PT0S', warnings: [], references: [], checkpoints,
  };
}

const RAVITO: Service[] = ['WATER', 'DRINKS', 'COLD_FOOD'];
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const NO_AID: NutritionProfile = { ...DEFAULT_PROFILE, eatAtAid: false };

describe('nutrition par tronçon', () => {
  it('module l\'objectif : un quart de moins la première heure, 10 % de moins la nuit', () => {
    const n = computeNutrition(plan([120], [60, 60]), [[], RAVITO, []], NO_AID);

    expect(n.legs[0].targetG).toBeCloseTo(70 * (120 - 15) / 60);   // 1re heure à 75 %
    expect(n.legs[1].targetG).toBeCloseTo(70 * 54 / 60);           // 1 h de nuit à 90 %
    expect(n.legs[0].waterMl).toBe(1000);
    expect(n.legs[1].waterMl).toBe(400);
  });

  it('compte ce qu\'on mange aux ravitos, si le coureur y mange', () => {
    const services: Service[][] = [[], RAVITO, ['WATER', 'HOT_FOOD'], []];
    const eats = computeNutrition(plan([120], [120], [120]), services, DEFAULT_PROFILE);
    expect(eats.legs.map((l) => l.aidCarbsG)).toEqual([0, 30, 60]);
    expect(eats.points[1].eatG).toBe(30);
    expect(eats.totals.aidCarbsG).toBe(90);

    const skips = computeNutrition(plan([120], [120], [120]), services, NO_AID);
    expect(skips.legs.every((l) => l.aidCarbsG === 0)).toBe(true);
    expect(sum(skips.totals.items)).toBeGreaterThan(sum(eats.totals.items));
  });

  it('remplit les flasques de boisson d\'abord, autant que le coureur le veut', () => {
    const n = computeNutrition(plan([180]), [[], []], NO_AID);   // 1,5 L : 3 flasques dont 2 de Meltonic
    expect(n.points[0]).toMatchObject({ fillFlasks: 3, fillDrinkFlasks: 2 });
    expect(n.legs[0].drinkMl).toBeCloseTo(1000);
    expect(n.legs[0].drinkCarbsG).toBeCloseTo(60);

    // Tronçon court : 1 seule flasque à remplir, c'est la boisson.
    const short = computeNutrition(plan([60]), [[], []], NO_AID);
    expect(short.points[0]).toMatchObject({ fillFlasks: 1, fillDrinkFlasks: 1 });

    const water = computeNutrition(plan([180]), [[], []], { ...NO_AID, drinkFlasks: 0 });
    expect(water.drink).toBeNull();
    expect(water.legs[0].drinkCarbsG).toBe(0);
  });

  it('prévient quand les flasques ne suffisent pas jusqu\'au prochain point d\'eau', () => {
    const n = computeNutrition(plan([120], [120], [60]), [[], ['COLD_FOOD'], RAVITO, []], NO_AID);
    expect(n.points[1].fillFlasks).toBe(0);
    expect(n.alerts[0]).toContain('P0 → P2 : environ 2,0 L à boire pour 1,5 L');
  });

  it('prend les produits à tour de rôle, sans arrondir chaque tronçon vers le haut', () => {
    const n = computeNutrition(plan([240]), [[], []], { ...NO_AID, drinkFlasks: 0 });
    expect(n.legs[0].sequence.slice(0, 4)).toEqual(['gel', 'compote', 'gel', 'compote']);

    const many = computeNutrition(plan([30], [30], [30], [30]), [[], RAVITO, RAVITO, RAVITO, []], { ...NO_AID, drinkFlasks: 0 });
    // ≈ 122 g sur la course (1re heure réduite) : 3 ou 4 produits, pas un par tronçon « par sécurité ».
    expect(sum(many.totals.items)).toBeGreaterThanOrEqual(3);
    expect(sum(many.totals.items)).toBeLessThanOrEqual(4);
  });

  it('ne fait porter que jusqu\'à l\'assistance, qui donne la suite et prépare les flasques', () => {
    const services: Service[][] = [[], RAVITO, RAVITO, RAVITO, []];
    const n = computeNutrition(plan([120], [120], [120], [120]), services, NO_AID, ['2']);

    expect(n.points[2].crew).toBe(true);
    expect(sum(n.points[0].take) + sum(n.points[2].take)).toBe(sum(n.totals.items));
    expect(sum(n.points[2].take)).toBeGreaterThan(0);
    // Doses : remplissage en P1 (porté depuis le départ), en P3 (donné par l'assistance) ; en P2 l'assistance prépare.
    expect(n.points[0].takeDrinkDoses).toBe(2);
    expect(n.points[2].takeDrinkDoses).toBe(2);

    const alone = computeNutrition(plan([120], [120], [120], [120]), services, NO_AID);
    expect(sum(alone.points[0].take)).toBe(sum(alone.totals.items));
    expect(alone.points[2].crew).toBe(false);
  });

  it('au sac de délestage, on remplit soi-même avec ce qu\'il contient', () => {
    const services: Service[][] = [[], RAVITO, [...RAVITO, 'DROP_BAG'], RAVITO, []];
    const n = computeNutrition(plan([120], [120], [120], [120]), services, NO_AID);
    expect(n.points[2].dropBag).toBe(true);
    expect(n.points[2].takeDrinkDoses).toBe(4);   // remplissages en P2 et P3
  });

  it('formule la consigne de chaque tronçon', () => {
    const n = computeNutrition(plan([120], [240]), [[], RAVITO, []], { ...DEFAULT_PROFILE, drinkFlasks: 0 });
    expect(describeRhythm(n.legs[1], n, plan([120], [240]))).toMatch(/^1 produit toutes les \d+ min$/);

    const gels = { ...NO_AID, drinkFlasks: 0, products: DEFAULT_PROFILE.products.map((p) => ({ ...p, enabled: p.kind === 'GEL' })) };
    const g = computeNutrition(plan([240]), [[], []], gels);
    expect(describeRhythm(g.legs[0], g, plan([240]))).toMatch(/^1 gel toutes les \d+ min$/);

    const fed = computeNutrition(plan([120], [20]), [[], ['WATER', 'HOT_FOOD'], []], DEFAULT_PROFILE);
    expect(describeRhythm(fed.legs[1], fed, plan([120], [20]))).toBe('Rien à manger : le ravito et la boisson suffisent');
  });

  it('décrit flasques et produits', () => {
    const n = computeNutrition(plan([180]), [[], []], NO_AID);
    expect(describeFill(3, 2, n)).toBe('Remplir 3 flasques (dont 2 de Meltonic)');
    expect(describeFill(2, 2, n)).toBe('Remplir 2 flasques de Meltonic');
    expect(describeFill(1, 0, n)).toBe("Remplir 1 flasque d'eau");
    expect(describeItems({ compote: 1, gel: 2 }, DEFAULT_PROFILE.products)).toBe('2 Gel Décathlon, 1 Compote Baouw');
  });

  it('reprend un profil enregistré par la version précédente', () => {
    const old = {
      carbsPerHour: 70, flasks: 3, drinkFlasks: 5, hasCrew: true, flaskMl: 500,
      products: [
        { id: 'gel', name: 'Gel', kind: 'GEL', carbsG: 40, share: 2 },
        { id: 'bar', name: 'Barre', kind: 'BAR', carbsG: 25, share: 0 },
        { id: 'compote', name: 'Compote', kind: 'COMPOTE', carbsG: 30, share: 1 },
        { id: 'drink', name: 'Boisson', kind: 'DRINK', carbsG: 30, share: 0 },
      ],
    };
    const p = normalizeProfile(old);
    expect(p.products.map((x) => [x.kind, x.enabled])).toEqual([['GEL', true], ['SOLID', false], ['SOLID', true], ['DRINK', true]]);
    expect(p.drinkFlasks).toBe(3);
    expect(p.eatAtAid).toBe(true);
    expect('hasCrew' in p).toBe(false);
    expect(normalizeProfile(null)).toEqual(DEFAULT_PROFILE);
  });
});
