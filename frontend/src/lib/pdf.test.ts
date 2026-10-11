import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CourseView, RacePlan } from '../api/types';
import fixture from './__fixtures__/bogomiles-plan.json';
import { buildPlanPdf, longDateTime, pdfFilename, pdfText } from './pdf';

const course = fixture.course as unknown as CourseView;
const plans = fixture.plans as unknown as RacePlan[];

describe('plan de course en PDF', () => {
  it('produit un A4 complet : en-tête, scénarios, profil, références, passages, comparaison', async () => {
    const doc = await buildPlanPdf({ course, plans, selected: 1 });
    const bytes = doc.output('arraybuffer');
    // PDF_OUT=/chemin/plan.pdf npm test : pour regarder le résultat
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, new Uint8Array(bytes));

    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(3);
    for (const expected of ['Raid des Bogomiles 2026', 'Heures de passage', 'Comparaison des sc', 'Tes r', 'Profil']) {
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
