import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft';
import { countdown, defaultRaceId, isPast, sortRaces, type RaceEntry } from './races';

const now = new Date('2026-10-31T10:00');
const race = (id: string, start: string, finish: string | null = null): RaceEntry => ({
  id, createdAt: '2026-01-01T00:00:00Z', draft: { ...emptyDraft(), name: id, start },
  summary: finish ? { km: 60, gainM: 3000, points: 7, finish, profile: [] } : null,
});

describe('mes courses', () => {
  const cathares = race('cathares', '2027-03-13T07:00', '2027-03-13T15:48');
  const vercors = race('vercors', '2027-06-19T06:00');
  const troubadours = race('troubadours', '2026-10-23T11:00', '2026-10-24T02:43');
  const sansDate = race('sans-date', '');

  it('range à venir (la plus proche d\'abord, sans date à la fin) et passées (la plus récente d\'abord)', () => {
    const { upcoming, past } = sortRaces([vercors, troubadours, sansDate, cathares], now);
    expect(upcoming.map((r) => r.id)).toEqual(['cathares', 'vercors', 'sans-date']);
    expect(past.map((r) => r.id)).toEqual(['troubadours']);
  });

  it('une course reste à venir jusqu\'à six heures après l\'arrivée prévue', () => {
    expect(isPast(troubadours, new Date('2026-10-24T08:00'))).toBe(false);
    expect(isPast(troubadours, new Date('2026-10-24T09:00'))).toBe(true);
  });

  it('ouvre la course d\'avant, ou la prochaine à venir si celle d\'avant est passée', () => {
    expect(defaultRaceId({ active: 'vercors', races: [cathares, vercors] }, now)).toBe('vercors');
    expect(defaultRaceId({ active: 'troubadours', races: [troubadours, vercors, cathares] }, now)).toBe('cathares');
    expect(defaultRaceId({ active: 'troubadours', races: [troubadours] }, now)).toBe('troubadours');
    expect(defaultRaceId({ active: null, races: [] }, now)).toBeNull();
  });

  it('compte les jours puis les mois', () => {
    expect(countdown(cathares, now)?.value).toBe('4 mois');
    expect(countdown(race('x', '2026-11-12T07:00'), now)?.value).toBe('12 jours');
    expect(countdown(race('x', '2026-11-01T07:00'), now)?.value).toBe('demain');
    expect(countdown(troubadours, now)).toBeNull();
  });
});
