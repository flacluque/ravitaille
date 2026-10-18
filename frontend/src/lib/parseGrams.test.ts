import { describe, expect, it } from 'vitest';
import { parseGrams } from '../components/RavitosView';

describe('parseGrams', () => {
  it('accepte les saisies courantes de glucides', () => {
    expect(parseGrams('25')).toBe(25);
    expect(parseGrams('25,5')).toBe(25.5);
    expect(parseGrams('25 g')).toBe(25);
    expect(parseGrams('25g')).toBe(25);
    expect(parseGrams(' 22.5 ')).toBe(22.5);
    expect(parseGrams('')).toBe(0);
    expect(parseGrams('beaucoup')).toBe(0);
  });
});
