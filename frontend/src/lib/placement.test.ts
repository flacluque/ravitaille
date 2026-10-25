import { describe, expect, it } from 'vitest';
import type { Checkpoint, CourseView, Marker, ProfilePoint } from '../api/types';
import { autoPosition, bounds, checkPlacement, placementWarnings, pointAt, savedPositions, snapToTrack } from './placement';

const KM_LAT = 1 / 111.195;
// Trace plein nord de 20 km, qui monte régulièrement : 100 m de D+ par km.
const profile: ProfilePoint[] = Array.from({ length: 201 }, (_, i) => ({
  km: i / 10, elevationM: 100 + i * 10, cumulativeGainM: i * 10, cumulativeLossM: 0, lat: 43 + (i / 10) * KM_LAT, lon: 2,
}));

function cp(code: string, km: number, gainM: number | null): Checkpoint {
  return { code, name: code, km, gainM, lossM: null, cutoffIn: null, cutoffOut: null, aid: 'LIGHT', services: [] };
}

function marker(code: string, km: number, extra: Partial<Marker> = {}): Marker {
  const p = pointAt(profile, km);
  return { code, name: code, km, trackKm: km, lat: p.lat, lon: p.lon, elevationM: p.elevationM, aid: 'LIGHT',
    placement: 'ROADBOOK', roadbookTrackKm: km, waypointName: null, waypointKm: null, ...extra };
}

/** Roadbook juste partout, sauf Greffeil : annoncé au km 8 (D+ 1 200 m), il est au km 12 de la trace. */
function course(greffeil: Partial<Marker> = {}): CourseView {
  return {
    race: { name: 'Test', start: '2026-10-24T07:00:00', maxDuration: null,
      checkpoints: [cp('D', 0, 0), cp('C', 5, 500), cp('G', 8, 1200), cp('A', 20, 2000)] },
    track: { name: 't', pointCount: 201, distanceKm: 20, gainM: 2000, lossM: 0, minElevationM: 100, maxElevationM: 2100, profile },
    markers: [marker('D', 0), marker('C', 5), marker('G', 8, greffeil), marker('A', 20)],
  };
}

describe('placement des ravitos', () => {
  it('interpole un point de la trace', () => {
    const p = pointAt(profile, 3.25);
    expect(p.cumulativeGainM).toBeCloseTo(325);
    expect(p.lat).toBeCloseTo(43 + 3.25 * KM_LAT, 8);
  });

  it('accroche un clic à la trace, entre les deux voisins', () => {
    const at = (km: number) => [43 + km * KM_LAT, 2.001] as const;
    expect(snapToTrack(profile, ...at(6.3), 0, 20)).toBeCloseTo(6.3, 2);
    // Au-delà du voisin suivant : collé à la borne.
    expect(snapToTrack(profile, ...at(15), 5.1, 9.9)).toBeCloseTo(9.9);
  });

  it('signale un ravito dont le D+ ne colle pas avec la trace', () => {
    const c = course();
    expect(placementWarnings(c)).toEqual([2]);
    const check = checkPlacement(c, 2, { km: 8, manual: false });
    expect(check.gainOff).toBe(true);
    expect(check.trackGainM).toBeCloseTo(800);
    expect(check.expectedGainM).toBe(1200);
    // Replacé au km 12, le D+ colle.
    expect(checkPlacement(c, 2, { km: 12, manual: true }).gainOff).toBe(false);
  });

  it("ne signale plus le D+ d'un ravito placé à la main", () => {
    expect(checkPlacement(course(), 2, { km: 8, manual: true }).warn).toBe(false);
  });

  it('demande de trancher entre waypoint et roadbook trop éloignés', () => {
    const c = course({ placement: 'WAYPOINT', trackKm: 12, waypointName: 'RAV G', waypointKm: 12 });
    const check = checkPlacement(c, 2, { km: 12, manual: false });
    expect(check.conflict).toBe(true);
    expect(check.gainOff).toBe(false);
    expect(check.warn).toBe(true);
    expect(checkPlacement(c, 2, { km: 12, manual: true }).conflict).toBe(false);
  });

  it('remet un ravito à sa position automatique : waypoint, sinon roadbook', () => {
    expect(autoPosition(marker('G', 12, { placement: 'MANUAL', roadbookTrackKm: 8 }))).toEqual({ km: 8, placement: 'ROADBOOK' });
    expect(autoPosition(marker('G', 12, { placement: 'MANUAL', roadbookTrackKm: 8, waypointKm: 11.5 })))
      .toEqual({ km: 11.5, placement: 'WAYPOINT' });
  });

  it('borne le déplacement entre les voisins et ne garde que les positions placées à la main', () => {
    const pos = [{ km: 0, manual: false }, { km: 5, manual: false }, { km: 12, manual: true }, { km: 20, manual: false }];
    expect(bounds(pos, 2)).toEqual({ lo: 5.1, hi: 19.9 });
    expect(savedPositions(pos)).toEqual([null, null, 12, null]);
  });
});
