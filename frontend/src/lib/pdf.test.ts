import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CourseView, RacePlan } from '../api/types';
import fixture from './__fixtures__/bogomiles-plan.json';
import { buildPlanPdf, longDateTime, pdfFilename, pdfText } from './pdf';
import type { GearItem } from './gear';
import { DEFAULT_PROFILE } from './nutrition';
import { defaultServices } from './services';

const course = fixture.course as unknown as CourseView;
const plans = fixture.plans as unknown as RacePlan[];
const services = course.race.checkpoints.map((c) => c.services ?? defaultServices(c.aid));
const gear: GearItem[] = [
  { id: '1', name: '2 lampes frontales avec piles de rechange', status: 'MANDATORY', packed: true },
  { id: '2', name: "1,5 l d'eau", status: 'MANDATORY', packed: false },
  { id: '3', name: 'Bâtons', status: 'PERSONAL', packed: false },
];

describe('plan de course en PDF', () => {
  it('produit un A4 complet : en-tête, scénarios, profil, références, passages, comparaison', async () => {
    const doc = await buildPlanPdf({ course, plans, selected: 1, services, nutrition: DEFAULT_PROFILE, gear });
    const bytes = doc.output('arraybuffer');
    // PDF_OUT=/chemin/plan.pdf npm test : pour regarder le résultat
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, new Uint8Array(bytes));

    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(3);
    for (const expected of ['Raid des Bogomiles 2026', 'Heures de passage', 'Comparaison des sc', 'Tes r', 'Profil',
      'Nutrition et hydratation', 'Au d', 'Sur la course', 'Mat', '1 / 3 pr', 'obligatoires', 'eau ', 'solide']) {
      expect(text).toContain(expected);
    }
  });

  it('fonctionne sans trace GPX ni références multiples', async () => {
    const sansTrace = { ...course, track: null, markers: [] };
    const uneRef = plans.map((p) => ({ ...p, references: p.references.slice(0, 1) }));
    const doc = await buildPlanPdf({ course: sansTrace, plans: uneRef, selected: 0 });
    const text = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(text).not.toContain('Profil');
    expect(text).not.toContain('Tes r');
    expect(text).not.toContain('Nutrition et hydratation');
    expect(text).not.toContain('Mat\\351riel');
  });

  it('tient le résumé sur une page : passages, barrières et ravitos', async () => {
    const doc = await buildPlanPdf({ course, plans, selected: 1, services, nutrition: DEFAULT_PROFILE, gear, variant: 'summary' });
    const text = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(doc.getNumberOfPages()).toBe(1);
    for (const expected of ['Raid des Bogomiles 2026', 'Passages et ravitos', 'Au d', 'arriv']) expect(text).toContain(expected);
    for (const absent of ['Profil', 'Comparaison des sc', 'Nutrition et hydratation', '1 / 3 pr']) expect(text).not.toContain(absent);
    expect(pdfFilename('Raid des Bogomiles 2026', 'summary')).toBe('plan-raid-des-bogomiles-2026-resume.pdf');
  });

  it('ajoute la préparation Strava quand le plan en tient compte', async () => {
    const weeks = Array.from({ length: 16 }, (_, i) => ({
      start: `2026-${String(6 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
      effortKm: 30 + i * 2, km: 25 + i, gainM: 600, sessions: 3,
    }));
    const training = {
      active: true, elasticity: 0.1, personalRaces: 0, lowSpecificity: true,
      target: { start: '2026-07-01', end: '2026-10-13', blockWeeks: 14, complete: true, weeklyEffortKm: 52, weeklyKm: 40, weeklyGainM: 1200,
        longestEffortKm: 45, sessions: 48, activeWeeks: 11 },
      weeks, notes: ['Ta plus longue sortie (45 km-effort) fait 37 % de l\'effort de la course.'],
    };
    const withTraining = plans.map((p) => ({
      ...p, training,
      references: p.references.map((r, i) => ({ ...r, formFactor: i === 0 ? 0.969 : 1, weeklyEffortKm: i === 0 ? 40 : null })),
    }));
    const doc = await buildPlanPdf({ course, plans: withTraining, selected: 1 });
    const text = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    for (const expected of ['Ta préparation', '14 semaines : 52 km-effort par semaine', 'semaines sur 14', 'moyenne 52', 'Temps corrig', '+30 %', '-3,1 %', 'plus longue sortie']) {
      expect(text).toContain(expected);
    }
  });

  it('nomme le fichier d\'après la course', () => {
    expect(pdfFilename('Raid des Troubadours 2026')).toBe('plan-raid-des-troubadours-2026.pdf');
    expect(pdfFilename('La Malène de Proust')).toBe('plan-la-malene-de-proust.pdf');
    expect(pdfFilename('???')).toBe('plan-course.pdf');
  });

  it('écrit la date de départ en toutes lettres', () => {
    expect(longDateTime('2026-10-23T11:00:00')).toBe('vendredi 23 octobre 2026 à 11h00');
  });

  it('remplace les caractères que les polices du PDF ne savent pas afficher', () => {
    expect(pdfText('Molières-sur-l’Alberte (Hameau)')).toBe('Molières-sur-l’Alberte (Hameau)');
    expect(pdfText('passage ≈ 14h')).toBe('passage env. 14h');
    expect(pdfText('⚠ Marge serrée')).toBe('Marge serrée');
    expect(pdfText('Ravito 山')).toBe('Ravito');
  });
});
