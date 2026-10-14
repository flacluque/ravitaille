import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatDay, isIsoDate, monthGrid, prepWindow, todayIso, weekday } from './dates';

describe('dates', () => {
  it('compte les jours sans se soucier de l\'heure d\'été', () => {
    expect(addDays('2026-10-23', -7)).toBe('2026-10-16');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(weekday('2026-10-19')).toBe(0);   // lundi
    expect(weekday('2026-10-25')).toBe(6);   // dimanche
    expect(todayIso(new Date(2026, 9, 14, 23, 30))).toBe('2026-10-14');
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(formatDay('2026-10-23')).toBe('ven. 23 oct. 2026');
  });

  it('remplit le mois en semaines complètes, du lundi au dimanche', () => {
    const oct = monthGrid(2026, 9);
    expect(oct[0]).toBe('2026-09-28');
    expect(oct).toHaveLength(35);
    expect(oct[34]).toBe('2026-11-01');
    expect(monthGrid(2026, 1)).toHaveLength(35);   // février 2026 commence un dimanche
  });

  it('place le bloc de préparation avant la semaine de course', () => {
    // Course passée : le bloc entier.
    expect(prepWindow('2026-04-12', 12, '2026-10-14')).toEqual({
      start: '2026-01-11', end: '2026-04-05', raceWeek: '2026-04-05', elapsedWeeks: 12,
    });
    // Course dans 9 jours : bloc quasi complet, jusqu'à aujourd'hui.
    const soon = prepWindow('2026-10-23', 12, '2026-10-14');
    expect(soon.start).toBe('2026-07-24');
    expect(soon.end).toBe('2026-10-15');
    expect(soon.elapsedWeeks).toBeCloseTo(11.9, 1);
    // Course dans 8 semaines : 5 semaines sur 12 déjà faites.
    expect(prepWindow('2026-12-09', 12, '2026-10-14').elapsedWeeks).toBeCloseTo(5, 0);
    // Course lointaine : la préparation n'a pas commencé.
    expect(prepWindow('2027-06-01', 12, '2026-10-14').elapsedWeeks).toBe(0);
  });
});
