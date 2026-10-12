import { describe, expect, it } from 'vitest';
import type { CheckpointEta, RacePlan, Service } from '../api/types';
import { computeNutrition, DEFAULT_PROFILE, describeItems, type NutritionProfile } from './nutrition';

function eta(minutes: number, nightMinutes = 0): CheckpointEta {
  return {
    code: '', name: '', km: 0, cumulativeGainM: 0, legDistanceKm: 0, legGainM: 0, legLossM: 0,
    legDuration: `PT${minutes}M`, legPaceMinPerKm: 0, arrival: '2026-10-23T09:00:00', elapsed: 'PT0S', stop: 'PT0S',
    departure: '2026-10-23T09:00:00', cutoffIn: null, cutoffOut: null, marginIn: null, marginOut: null,
    status: 'NONE', legNightDuration: `PT${nightMinutes}M`,
  };
}

function plan(...legs: [number, number?][]): RacePlan {
  const checkpoints = [eta(0), ...legs.map(([m, n]) => eta(m, n ?? 0))].map((e, i) => ({ ...e, code: String(i), name: `P${i}` }));
  return {
    raceName: 'Test', elevationSource: 'ROADBOOK', totalDistanceKm: 0, totalGainM: 0, totalEffortKm: 0,
    scenario: { name: 'Réaliste', paceFactor: 1, fatigueExponent: 1.07, nightFactor: 1.1, lightStopMinutes: 4, fullStopMinutes: 15 },
    start: '', finish: '', totalDuration: 'PT0S', totalStops: 'PT0S', nightDuration: 'PT0S', warnings: [], references: [], checkpoints,
  };
}

const RAVITO: Service[] = ['WATER', 'DRINKS', 'COLD_FOOD'];

describe('nutrition par tronçon', () => {
  it('calcule glucides et eau selon la durée et la part de nuit', () => {
    const n = computeNutrition(plan([120], [60, 60]), [[], RAVITO, []], DEFAULT_PROFILE);

    expect(n.legs[0].carbsG).toBe(140);         // 2 h × 70 g
    expect(n.legs[0].waterMl).toBe(1000);       // 2 h × 500 ml
    expect(n.legs[1].waterMl).toBe(400);        // 1 h de nuit × 400 ml
    expect(n.totals.carbsG).toBe(210);
  });

  it('remplit les flasques pour tenir jusqu\'au prochain point d\'eau, et prévient si elles ne suffisent pas', () => {
    // P1 sans eau : de P0 à P2, 4 h → 2 L pour 1,5 L de flasques.
    const n = computeNutrition(plan([120], [120], [60]), [[], ['COLD_FOOD'], RAVITO, []], DEFAULT_PROFILE);

    expect(n.points[0]).toMatchObject({ fillFlasks: 3, fillDrinkFlasks: 1 });
    expect(n.points[1].fillFlasks).toBe(0);
    expect(n.points[2]).toMatchObject({ fillFlasks: 1, fillDrinkFlasks: 1 });
    expect(n.alerts).toHaveLength(1);
    expect(n.alerts[0]).toContain('P0 → P2 : environ 2,0 L à boire pour 1,5 L');
  });

  it('décompte la boisson énergétique et complète avec gels et compotes, 2 pour 1', () => {
    const n = computeNutrition(plan([180]), [[], []], DEFAULT_PROFILE);
    const leg = n.legs[0];

    // 3 h : 210 g ; 1,5 L d'eau dans 3 flasques dont 1 de Meltonic → 500 ml bus, 30 g.
    expect(leg.drinkMl).toBeCloseTo(500);
    expect(leg.drinkCarbsG).toBeCloseTo(30);
    expect(leg.items).toEqual({ gel: 3, compote: 2 });   // 120 + 60 = 180 g
    expect(leg.drinkCarbsG + leg.itemsCarbsG).toBeGreaterThanOrEqual(210 - 15);
  });

  it('reporte le reste d\'un tronçon sur le suivant, sans arrondir à chaque fois vers le haut', () => {
    const profile: NutritionProfile = { ...DEFAULT_PROFILE, drinkFlasks: 0 };
    const n = computeNutrition(plan([30], [30], [30], [30]), [[], RAVITO, RAVITO, RAVITO, []], profile);

    // 4 × 35 g = 140 g : 3 ou 4 produits sur la course, pas 4 × 1 produit « par sécurité » à chaque tronçon.
    const items = Object.values(n.totals.items).reduce((a, b) => a + b, 0);
    expect(items).toBeGreaterThanOrEqual(3);
    expect(items).toBeLessThanOrEqual(4);
    expect(n.drink).toBeNull();
  });

  it('porte tout depuis le départ, sauf réapprovisionnement au sac de délestage', () => {
    const services: Service[][] = [[], RAVITO, [...RAVITO, 'DROP_BAG'], RAVITO, []];
    const n = computeNutrition(plan([120], [120], [120], [120]), services, DEFAULT_PROFILE);

    const departure = n.points[0].restock;
    const bag = n.points[2].restock;
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(departure) + sum(bag)).toBe(sum(n.totals.items));
    expect(sum(bag)).toBeGreaterThan(0);
    // Doses de Meltonic : remplissage en P1 (porté depuis le départ), en P2 et P3 (pris dans le sac).
    expect(n.points[0].restockDrinkDoses).toBe(1);
    expect(n.points[2].restockDrinkDoses).toBe(2);
    expect(n.totals.drinkDoses).toBe(4);   // départ + P1 + P2 + P3
  });

  it("ne compte l'assistance que si le coureur en a une", () => {
    const services: Service[][] = [[], [...RAVITO, 'ASSISTANCE'], []];
    expect(computeNutrition(plan([120], [120]), services, DEFAULT_PROFILE).points[1].restock).toEqual({});
    const crew = computeNutrition(plan([120], [120]), services, { ...DEFAULT_PROFILE, hasCrew: true });
    expect(Object.keys(crew.points[1].restock).length).toBeGreaterThan(0);
  });

  it('décrit les produits dans l\'ordre du profil', () => {
    expect(describeItems({ compote: 1, gel: 2 }, DEFAULT_PROFILE.products)).toBe('2 Gel Décathlon, 1 Compote Baouw');
    expect(describeItems({}, DEFAULT_PROFILE.products)).toBe('');
  });
});
