import { describe, expect, it } from 'vitest';
import type { ExtractedRoadbook, RaceDefinition } from '../api/types';
import {
  draftToFile,
  draftToRace,
  emptyCheckpoint,
  emptyDraft,
  extractedToDraft,
  hasContent,
  parseClock,
  parseRoadbookFile,
  raceToDraft,
  resolveCutoffs,
  type RaceDraft,
} from './draft';

function troubadours(): RaceDraft {
  return {
    name: 'Trail des Troubadours',
    start: '2026-10-23T20:00',
    nightStart: '19h00',
    nightEnd: '7h45',
    checkpoints: [
      emptyCheckpoint({ code: 'D', name: 'Départ', km: '0', gainM: '', lossM: '', aid: 'NONE' }),
      emptyCheckpoint({ code: '1', name: 'Ravito 1', km: '18,5', gainM: '850', lossM: '700', cutoffIn: '23h30' }),
      emptyCheckpoint({ code: '2', name: 'Base de vie', km: '42', gainM: '1900', cutoffIn: '4h00', cutoffOut: '5h', aid: 'FULL' }),
      emptyCheckpoint({ code: 'A', name: 'Arrivée', km: '60', gainM: '2600', cutoffIn: '11h00', aid: 'NONE' }),
    ],
  };
}

describe('saisie des heures', () => {
  it.each([
    ['14h30', 870],
    ['14:30', 870],
    ['9h05', 545],
    ['14h', 840],
    [' 7 h 45 ', 465],
  ])('%s → %i min', (text, minutes) => expect(parseClock(text)).toBe(minutes));

  it.each(['', '24h00', '14h75', 'midi'])('refuse « %s »', (text) => expect(parseClock(text)).toBeNull());
});

describe('barrières', () => {
  it('déduit le jour de chaque barrière, en passant minuit', () => {
    expect(resolveCutoffs(troubadours())).toEqual([
      { cutoffIn: null, cutoffOut: null },
      { cutoffIn: '2026-10-23T23:30:00', cutoffOut: null },
      { cutoffIn: '2026-10-24T04:00:00', cutoffOut: '2026-10-24T05:00:00' },
      { cutoffIn: '2026-10-24T11:00:00', cutoffOut: null },
    ]);
  });
});

describe('conversion du roadbook', () => {
  it('produit la RaceDefinition attendue par l\'API', () => {
    const result = draftToRace(troubadours(), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.race.start).toBe('2026-10-23T20:00:00');
    expect(result.race.checkpoints[0]).toMatchObject({ km: 0, gainM: 0, lossM: 0 });
    expect(result.race.checkpoints[1]).toMatchObject({ km: 18.5, gainM: 850, lossM: 700 });
    expect(result.race.checkpoints[2]).toMatchObject({ lossM: null, aid: 'FULL' });
    expect(result.night).toEqual({ nightStart: '19:00', nightEnd: '07:45' });
  });

  it('exige le D+ partout sans trace GPX, mais pas avec', () => {
    const draft = troubadours();
    draft.checkpoints[2].gainM = '';
    const sansTrace = draftToRace(draft, false);
    expect(sansTrace.ok).toBe(false);
    if (!sansTrace.ok) expect(sansTrace.errors).toContain('D+ manquant pour « Base de vie » (obligatoire sans trace GPX).');
    expect(draftToRace(draft, true).ok).toBe(true);
  });

  it('signale les erreurs de saisie courantes', () => {
    const draft = troubadours();
    draft.name = '';
    draft.checkpoints[0].km = '1';
    draft.checkpoints[2].km = '10';
    draft.checkpoints[2].gainM = '500';
    draft.checkpoints[3].code = '1';
    draft.checkpoints[3].cutoffIn = '25h';
    const result = draftToRace(draft, false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'Donne un nom à la course.',
      'Codes en double : 1.',
      'Le départ doit être au km 0.',
      'Le km de « Base de vie » doit être supérieur à celui du point précédent.',
      'Le D+ cumulé de « Base de vie » est inférieur au précédent.',
      "Barrière d'entrée illisible pour « Arrivée » (format 14h30).",
    ]);
  });

  it("refuse un brouillon vide sans planter", () => {
    const result = draftToRace(emptyDraft(), false);
    expect(result.ok).toBe(false);
  });
});

describe('fichier roadbook', () => {
  const bogomiles: RaceDefinition = {
    name: 'Raid des Bogomiles 2026',
    start: '2026-10-23T11:00:00',
    maxDuration: 'PT26H',
    checkpoints: [
      { code: '1P', name: 'Départ', km: 0, gainM: 0, lossM: 0, cutoffIn: null, cutoffOut: null, aid: 'NONE' },
      { code: '5', name: "Château d'Arques", km: 52, gainM: 2239, lossM: 2055, cutoffIn: '2026-10-23T21:00:00', cutoffOut: '2026-10-23T22:00:00', aid: 'FULL' },
      { code: '1D', name: 'Arrivée', km: 103, gainM: 4000, lossM: 4090, cutoffIn: '2026-10-24T13:00:00', cutoffOut: null, aid: 'NONE' },
    ],
  };

  it('relit le format des exemples embarqués', () => {
    const draft = raceToDraft(bogomiles);
    expect(draft.start).toBe('2026-10-23T11:00');
    expect(draft.checkpoints[1]).toMatchObject({ km: '52', cutoffIn: '21h00', cutoffOut: '22h00', aid: 'FULL' });
    expect(draft.checkpoints[2].cutoffIn).toBe('13h00');
  });

  it("fait l'aller-retour export → import sans perte", () => {
    const file = draftToFile(raceToDraft(bogomiles, { nightStart: '18:40', nightEnd: '08:15' }))!;
    const back = draftToRace(parseRoadbookFile(file), false);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.race.checkpoints.map((c) => [c.cutoffIn, c.cutoffOut])).toEqual(
      bogomiles.checkpoints.map((c) => [c.cutoffIn, c.cutoffOut]),
    );
    expect(back.night).toEqual({ nightStart: '18:40', nightEnd: '08:15' });
  });

  it('accepte une requête de plan complète et refuse le reste', () => {
    expect(parseRoadbookFile(JSON.stringify({ race: bogomiles })).name).toBe('Raid des Bogomiles 2026');
    expect(() => parseRoadbookFile('<gpx/>')).toThrow("Ce fichier n'est pas un JSON valide.");
    expect(() => parseRoadbookFile('{"name":"x"}')).toThrow('il manque la liste "checkpoints"');
  });

  it("n'exporte pas une saisie invalide", () => {
    expect(draftToFile(emptyDraft())).toBeNull();
  });
});

describe('roadbook lu par l\'IA', () => {
  const extracted: ExtractedRoadbook = {
    name: 'Raid des Troubadours 2026',
    startDate: null,
    startTime: '09:00',
    checkpoints: [
      { code: '1P', name: 'Départ', km: 0, gainM: 0, lossM: 0, cutoffIn: null, cutoffOut: null, aid: 'NONE' },
      { code: '3', name: 'Molières', km: 20, gainM: 772, lossM: null, cutoffIn: '12h30', cutoffOut: null, aid: 'LIGHT' },
      { code: '1D', name: 'Arrivée', km: 88, gainM: 3426, lossM: 3564, cutoffIn: '04h30', cutoffOut: null, aid: 'NONE' },
    ],
    warnings: ['Le logo annonce 85 km, le tableau 88 km.'],
  };

  it('reprend la date déjà saisie quand le roadbook ne la donne pas', () => {
    const current = { ...emptyDraft(), start: '2026-10-23T07:00', nightStart: '18h40' };
    const { draft, warnings } = extractedToDraft(extracted, current);
    expect(draft.start).toBe('2026-10-23T09:00');
    expect(draft.nightStart).toBe('18h40');
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toContain('celle déjà saisie a été gardée');

    const result = draftToRace(draft, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.race.checkpoints[1]).toMatchObject({ km: 20, gainM: 772, lossM: null, cutoffIn: '2026-10-23T12:30:00' });
      expect(result.race.checkpoints[2].cutoffIn).toBe('2026-10-24T04:30:00');
    }
  });

  it('demande la date quand personne ne la connaît', () => {
    const { draft, warnings } = extractedToDraft(extracted, emptyDraft());
    expect(draft.start).toBe('');
    expect(warnings[1]).toBe('Date de départ non lue sur le roadbook : indique-la (heure lue : 09h00).');
  });

  it("sait si l'éditeur contient déjà une saisie", () => {
    expect(hasContent(emptyDraft())).toBe(false);
    expect(hasContent({ ...emptyDraft(), name: 'Mon trail' })).toBe(true);
    const draft = emptyDraft();
    draft.checkpoints[1].km = '42';
    expect(hasContent(draft)).toBe(true);
  });
});
