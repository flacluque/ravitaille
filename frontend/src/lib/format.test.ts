import { describe, expect, it } from 'vitest';
import {
  durationMinutes,
  formatClock,
  formatHm,
  formatPace,
  parseHmInput,
} from './format';

describe('durées ISO', () => {
  it('lit les durées Java, y compris négatives et avec secondes décimales', () => {
    expect(durationMinutes('PT8H48M')).toBe(528);
    expect(durationMinutes('PT14H12M2S')).toBeCloseTo(852.033, 2);
    expect(durationMinutes('PT-1H-30M')).toBe(-90);
    expect(durationMinutes('PT26M')).toBe(26);
    expect(durationMinutes('PT0.5S')).toBeCloseTo(0.00833, 4);
    expect(durationMinutes('P1DT2H')).toBe(1560);
    expect(() => durationMinutes('8h48')).toThrow();
  });

  it('formate en heures-minutes', () => {
    expect(formatHm(852.03)).toBe('14h12');
    expect(formatHm(58)).toBe('0h58');
    expect(formatHm(-42)).toBe('-0h42');
    expect(formatHm(59.6)).toBe('1h00');
  });
});

describe('saisie du temps de référence', () => {
  it.each([
    ['8h48', 'PT8H48M'],
    ['8:48', 'PT8H48M'],
    [' 8 h 05 ', 'PT8H5M'],
    ['11h', 'PT11H0M'],
    ['528', 'PT8H48M'],
  ])('%s → %s', (input, expected) => {
    expect(parseHmInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '8h75', '0h00', '0'])('refuse « %s »', (input) => {
    expect(parseHmInput(input)).toBeNull();
  });
});

describe('heures de passage', () => {
  it("affiche le jour et l'heure locale de la course, sans fuseau", () => {
    expect(formatClock('2026-10-23T13:31:02.5')).toBe('ven 13h31');
    expect(formatClock('2026-10-24T01:12:02')).toBe('sam 01h12');
  });

  it('formate une allure', () => {
    expect(formatPace(8.2)).toBe("8'12/km");
    expect(formatPace(6)).toBe("6'00/km");
  });
});
