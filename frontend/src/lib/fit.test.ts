import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import type { CourseView, RacePlan } from '../api/types';
import fixture from './__fixtures__/bogomiles-plan.json';
import { buildCourseFit, fitCoursePoints, fitFilename, fitPointName, timedTrack } from './fit';
import { defaultServices } from './services';

const course = fixture.course as unknown as CourseView;
const plans = fixture.plans as unknown as RacePlan[];
const plan = plans[1];
const services = course.race.checkpoints.map((c) => c.services ?? defaultServices(c.aid));

describe('parcours FIT pour montre Garmin', () => {
  it('nomme les points en 15 caractères sans accents, barrière en fin', () => {
    expect(fitPointName('Greffeil', 'aid', '2026-10-24T03:45:00', true)).toBe('Greffeil 3h45');
    expect(fitPointName("Molières-sur-l'Alberte", 'aid', '2026-10-23T14:30:00', true)).toBe('Molieres 14h30');
    expect(fitPointName('Lac de Cavayère', 'checkpoint', null, true)).toBe('Lac de Cavayere');
    expect(fitPointName('Départ Cité de Carcassonne', 'start', null, true)).toBe('Depart');
    expect(fitPointName('Palaja (camp de Villemaury)', 'aid', null, false)).toBe('Palaja');
    for (const p of fitCoursePoints(course, plan, services, { cutInName: true, checkpoints: true })) expect(p.name.length).toBeLessThanOrEqual(15);
  });

  it('peut laisser de côté les pointages sans ravito', () => {
    const all = fitCoursePoints(course, plan, services, { cutInName: false, checkpoints: true });
    const noCp = fitCoursePoints(course, plan, services.map((s, i) => (i === 1 ? [] : s)), { cutInName: false, checkpoints: false });
    expect(all).toHaveLength(plan.checkpoints.length);
    expect(noCp).toHaveLength(plan.checkpoints.length - 1);
  });

  it('donne une heure croissante le long de la trace, avec les arrêts aux ravitos', () => {
    const track = timedTrack(course, plan);
    for (let i = 1; i < track.length; i++) {
      expect(track[i].minutes).toBeGreaterThanOrEqual(track[i - 1].minutes);
      expect(track[i].km).toBeGreaterThanOrEqual(track[i - 1].km);
    }
    const finish = plan.checkpoints[plan.checkpoints.length - 1];
    const startMin = new Date(plan.start).getTime();
    expect(Math.abs(track[track.length - 1].minutes - (new Date(finish.arrival).getTime() - startMin) / 60000)).toBeLessThan(1);
  });

  it('écrit un fichier FIT de parcours que le SDK de Garmin relit', async () => {
    const bytes = await buildCourseFit(course, plan, services, { cutInName: true, checkpoints: true });
    expect(bytes).not.toBeNull();
    const decoder = new Decoder(Stream.fromByteArray(bytes!));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toHaveLength(0);
    expect(messages.fileIdMesgs![0].type).toBe('course');
    expect(messages.courseMesgs![0].name).toBe('Raid des Bogomiles 2026');
    expect(messages.recordMesgs!.length).toBeGreaterThan(100);
    expect(messages.coursePointMesgs!.map((p) => p.name)).toContain('Greffeil 3h45');
    expect(messages.coursePointMesgs!.map((p) => p.type)).toContain('aidStation');
    const recs = messages.recordMesgs as { timestamp: Date }[];
    const span = (recs[recs.length - 1].timestamp.getTime() - recs[0].timestamp.getTime()) / 60000;
    const expected = (new Date(plan.finish).getTime() - new Date(plan.start).getTime()) / 60000;
    expect(Math.abs(span - expected)).toBeLessThan(1);
  });

  it('ne produit rien sans trace GPX', async () => {
    expect(await buildCourseFit({ ...course, track: null }, plan, services, { cutInName: true, checkpoints: true })).toBeNull();
    expect(fitFilename('Raid des Bogomiles 2026')).toBe('raid-des-bogomiles-2026.fit');
  });
});
