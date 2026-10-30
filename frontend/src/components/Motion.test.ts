import { afterEach, describe, expect, it, vi } from 'vitest';
import { ms } from './Motion';

const tokens: Record<string, string> = {};

describe('durées des transitions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lit les millisecondes comme les secondes réécrites par la compilation', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => tokens[name] ?? '' }));
    tokens['--a'] = ' 150ms';
    tokens['--b'] = '.15s';
    tokens['--c'] = '0.25s';
    expect(ms('--a')).toBe(150);
    expect(ms('--b')).toBe(150);
    expect(ms('--c')).toBe(250);
    expect(ms('--absent')).toBe(0);
  });
});
