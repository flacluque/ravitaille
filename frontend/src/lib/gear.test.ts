import { describe, expect, it } from 'vitest';
import type { RacePlan } from '../api/types';
import { type GearItem, mergeExtracted, requiredWaterLiters, suggestions, templateItems, waterCheck } from './gear';
import { DEFAULT_PROFILE } from './nutrition';

const item = (name: string, status: GearItem['status'] = 'MANDATORY', packed = false): GearItem => ({ id: name, name, status, packed });
const planWithNight = (night: string) => ({ nightDuration: night } as RacePlan);

describe('checklist du matériel', () => {
  it('fusionne la lecture du règlement en gardant le perso et les cases déjà cochées', () => {
    const current = [item('1 Sifflet', 'RECOMMENDED', true), item('Bâtons', 'PERSONAL', true), item('Gants', 'MANDATORY')];
    const merged = mergeExtracted(current, { race: 'Raid des Troubadours', warnings: [], items: [
      { name: '1 sifflet', status: 'MANDATORY' },
      { name: "1,5 l d'eau", status: 'MANDATORY' },
    ] });

    expect(merged.map((i) => [i.name, i.status, i.packed])).toEqual([
      ['1 sifflet', 'MANDATORY', true],
      ["1,5 l d'eau", 'MANDATORY', false],
      ['Bâtons', 'PERSONAL', true],
    ]);
  });

  it('suggère la frontale et une couche chaude quand le plan passe de nuit', () => {
    expect(suggestions([item('Sifflet')], planWithNight('PT0S'))).toEqual([]);
    const night = suggestions([item('Sifflet')], planWithNight('PT3H'));
    expect(night[0]).toContain('Lampe frontale');
    expect(night).toHaveLength(3);
    expect(suggestions([item('2 lampes frontales'), item('2ème couche chaude'), item('Lumière rouge')], planWithNight('PT3H'))).toEqual([]);
  });

  it("lit l'eau imposée par le règlement", () => {
    expect(requiredWaterLiters([item("1,5 l d'eau")])).toBe(1.5);
    expect(requiredWaterLiters([item("Réserve d'eau de 1 litre minimum")])).toBe(1);
    expect(requiredWaterLiters([item('1 l d\'eau', 'RECOMMENDED')])).toBeNull();
    expect(requiredWaterLiters([item('Sifflet')])).toBeNull();
  });

  it("compare l'eau obligatoire aux flasques", () => {
    expect(waterCheck([item("1,5 l d'eau")], DEFAULT_PROFILE)).toEqual({
      ok: true, message: "1,5 L d'eau obligatoires : tes 3 flasques de 500 ml font 1,5 L.",
    });
    expect(waterCheck([item("1,5 l d'eau")], { ...DEFAULT_PROFILE, flasks: 2 })?.ok).toBe(false);
    expect(waterCheck([item('Sifflet')], DEFAULT_PROFILE)).toBeNull();
  });

  it('propose une liste type à adapter', () => {
    const list = templateItems();
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((i) => i.status === 'RECOMMENDED' && !i.packed)).toBe(true);
  });
});
