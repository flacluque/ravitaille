import { describe, expect, it } from 'vitest';
import type { ProfilePoint } from '../api/types';
import { nearestPoint, niceTicks, pointAtKm } from './track';

const pt = (km: number, lat = 43, lon = 2.3): ProfilePoint => ({
  km, elevationM: 100 + km, cumulativeGainM: 0, cumulativeLossM: 0, lat, lon,
});

describe('profil', () => {
  const profile = [pt(0, 43.0), pt(0.1, 43.001), pt(0.2, 43.002), pt(0.3, 43.003)];

  it('trouve le point le plus proche en km, bornes comprises', () => {
    expect(pointAtKm(profile, 0.14).km).toBe(0.1);
    expect(pointAtKm(profile, 0.16).km).toBe(0.2);
    expect(pointAtKm(profile, -5).km).toBe(0);
    expect(pointAtKm(profile, 99).km).toBe(0.3);
  });

  it('trouve le point le plus proche sur la carte', () => {
    expect(nearestPoint(profile, 43.0021, 2.3).km).toBe(0.2);
  });

  it('produit des graduations rondes', () => {
    expect(niceTicks(0, 101.5, 10)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(101, 635, 4)).toEqual([200, 400, 600]);
  });
});
