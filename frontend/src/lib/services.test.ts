import { describe, expect, it } from 'vitest';
import { aidFor, defaultServices, sortServices } from './services';

describe('services ↔ type d\'arrêt (comme côté Java)', () => {
  it('déduit le type d\'arrêt des services', () => {
    expect(aidFor([])).toBe('NONE');
    expect(aidFor(['ASSISTANCE'])).toBe('NONE');
    expect(aidFor(['WATER'])).toBe('LIGHT');
    expect(aidFor(['WATER', 'HOT_FOOD'])).toBe('FULL');
    expect(aidFor(['DROP_BAG'])).toBe('FULL');
  });

  it('et les services par défaut du type d\'arrêt', () => {
    expect(defaultServices('LIGHT')).toEqual(['WATER', 'DRINKS', 'COLD_FOOD']);
    expect(aidFor(defaultServices('FULL'))).toBe('FULL');
  });

  it('trie dans l\'ordre d\'affichage', () => {
    expect(sortServices(['ASSISTANCE', 'WATER', 'HOT_FOOD'])).toEqual(['WATER', 'HOT_FOOD', 'ASSISTANCE']);
  });
});
