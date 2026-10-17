import { describe, expect, it } from 'vitest';
import { crewOffset, decodeShare, encodeShare, latestPass, meeting, nextMeeting, type CrewShare } from './crew';
import { driveTime, estimateDrive } from './route';

const point = (code: string, arrivals: number[], cutoff: number | null = null) => ({
  code, name: `P${code}`, km: 0, lat: 43.2, lon: 2.36, arrivals, cutoff, cutoffOut: false, nightAfter: false, prepare: ['2 gels'],
});

const share: CrewShare = {
  v: 1, race: 'Raid des Bogomiles 2026', start: '2026-10-23T11:00:00', sentAt: '2026-10-22T19:00:00Z', runner: 'Flavien',
  scenarios: ['Optimiste', 'Réaliste', 'Prudent'], likely: 1,
  points: [point('1P', [0, 0, 0]), point('4', [256, 267, 281], 390), point('5', [408, 428, 452], 600), point('11', [610, 658, 720], 1005)],
  crew: [2, 3], fix: null,
};

describe('lien assistance', () => {
  it('fait l\'aller-retour compressé, et refuse un lien abîmé', async () => {
    const hash = await encodeShare(share);
    expect(hash.startsWith('#assistance=')).toBe(true);
    expect(hash.slice('#assistance='.length)).not.toMatch(/[+/=]/);
    expect(await decodeShare(hash)).toEqual(share);
    expect(await decodeShare(hash.slice(0, hash.length / 2))).toBeNull();
    expect(await decodeShare('#plan')).toBeNull();
  });

  it('cale les rendez-vous sur le dernier passage connu et la marge choisie', () => {
    expect(meeting(share, 2, null, 15)).toMatchObject({ early: 408, likely: 428, late: 452, beThere: 393, margin: 172, passed: false });
    const pass = { index: 1, at: 255 };   // 12 min d'avance à Caunette
    expect(crewOffset(share, pass)).toBe(-12);
    expect(meeting(share, 2, pass, 30)).toMatchObject({ early: 396, likely: 416, late: 440, beThere: 366 });
    expect(meeting(share, 1, pass, 15)).toMatchObject({ likely: 255, passed: true });
    expect(nextMeeting(share, pass, 300)).toBe(2);
    expect(nextMeeting(share, { index: 2, at: 420 }, 430)).toBe(3);
    // Le passage saisi par l'assistance l'emporte s'il est plus loin que le recalage du coureur.
    expect(latestPass({ ...share, fix: { index: 1, at: 255 } }, { index: 2, at: 420 })).toEqual({ index: 2, at: 420 });
    expect(latestPass({ ...share, fix: { index: 2, at: 425 } }, { index: 1, at: 255 })).toEqual({ index: 2, at: 425 });
  });
});

describe('temps de route', () => {
  const arques = { lat: 43.1545, lon: 2.3485 };
  const greffeil = { lat: 43.1215, lon: 2.4212 };

  it('prend l\'itinéraire OSRM, ou une estimation sans réseau', async () => {
    const ok = (async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 14800, duration: 1260 }] }))) as unknown as typeof fetch;
    expect(await driveTime(arques, greffeil, ok)).toEqual({ km: 15, minutes: 26, source: 'osrm' });
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const est = await driveTime(arques, greffeil, offline);
    expect(est.source).toBe('estimate');
    expect(est).toEqual(estimateDrive(arques, greffeil));
    expect(est.km).toBeGreaterThan(5);
  });
});
