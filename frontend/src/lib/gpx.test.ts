import { describe, expect, it } from 'vitest';
import type { CourseView, RacePlan } from '../api/types';
import fixture from './__fixtures__/bogomiles-plan.json';
import { buildCourseGpx, gpxFilename, gpxWaypoints } from './gpx';
import { defaultServices } from './services';

const course = fixture.course as unknown as CourseView;
const plans = fixture.plans as unknown as RacePlan[];
const plan = plans[1];
const services = course.race.checkpoints.map((c) => c.services ?? defaultServices(c.aid));

describe('parcours GPX pour les autres montres', () => {
  it('nomme chaque ravito en entier, avec son heure prévue', () => {
    const wps = gpxWaypoints(course, plan, services, { timeInName: true, checkpoints: true });
    expect(wps).toHaveLength(plan.checkpoints.length);
    const eta = plan.checkpoints[3];
    const hm = eta.arrival.slice(11, 16).replace(/^0/, '').replace(':', 'h');
    expect(wps[3].name).toBe(`${eta.name} ${hm}`);
    expect(wps[3].description).toContain(`arrivée prévue ${hm}`);
    expect(gpxWaypoints(course, plan, services, { timeInName: false, checkpoints: true })[3].name).toBe(eta.name);
  });

  it('écrit la trace et les waypoints dans un GPX valide', () => {
    const gpx = buildCourseGpx(course, plan, services, { timeInName: true, checkpoints: true })!;
    const count = (re: RegExp) => gpx.match(re)?.length ?? 0;
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1"')).toBe(true);
    expect(count(/<wpt /g)).toBe(plan.checkpoints.length);
    expect(count(/<\/wpt>/g)).toBe(plan.checkpoints.length);
    expect(count(/<trkpt /g)).toBe(course.track!.profile.length);
    expect(gpx).toContain(`<name>${course.race.name}</name>`);
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true);
  });

  it('échappe les caractères spéciaux et refuse un parcours sans trace', () => {
    const special = { ...course, race: { ...course.race, name: 'Trail <Nuit> & Jour' } };
    expect(buildCourseGpx(special, plan, services, { timeInName: false, checkpoints: true })).toContain('Trail &lt;Nuit&gt; &amp; Jour');
    expect(buildCourseGpx({ ...course, track: null }, plan, services, { timeInName: false, checkpoints: true })).toBeNull();
    expect(gpxFilename('Raid des Bogomiles 2026')).toBe('raid-des-bogomiles-2026.gpx');
  });
});
