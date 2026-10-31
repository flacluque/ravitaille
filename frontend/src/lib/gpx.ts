import type { CourseView, RacePlan, Service } from '../api/types';
import { formatKm, localMinutes } from './format';
import { fitFilename, pointKind, type FitPointKind } from './fit';

/**
 * Parcours pour les montres d'autres marques (COROS, Suunto, Polar…) : un fichier GPX avec la trace et chaque ravito
 * en waypoint, nommé avec son heure de passage prévue (« Greffeil 15h06 »). Le GPX est le format de parcours que toutes
 * ces marques importent ; il n'a pas d'équivalent au partenaire virtuel du FIT de Garmin.
 */
export interface GpxOptions {
  /** Ajoute l'heure de passage prévue au nom du ravito. */
  timeInName: boolean;
  /** Garde aussi les pointages sans ravito. */
  checkpoints: boolean;
}

export interface GpxWaypoint {
  index: number;
  name: string;
  /** Détail : km, heures d'arrivée et de départ prévues. */
  description: string;
  kind: FitPointKind;
  lat: number;
  lon: number;
  ele: number;
}

/** « 2026-10-23T15:06:00 » → « 15h06 » */
function clock(iso: string): string {
  const m = ((Math.round(localMinutes(iso)) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

const KIND_TYPE: Record<FitPointKind, string> = {
  start: 'Départ', finish: 'Arrivée', aid: 'Ravito', water: 'Ravito (boisson)', checkpoint: 'Pointage',
};

/** Waypoints du parcours, dans l'ordre : le nom complet du point, et son heure prévue si demandé. */
export function gpxWaypoints(course: CourseView, plan: RacePlan, services: Service[][], options: GpxOptions): GpxWaypoint[] {
  const last = plan.checkpoints.length - 1;
  return plan.checkpoints.flatMap((eta, i) => {
    const marker = course.markers[i];
    if (!marker) return [];
    const kind = pointKind(i, last, services[i] ?? []);
    if (kind === 'checkpoint' && !options.checkpoints) return [];
    const time = clock(i === 0 ? eta.departure : eta.arrival);
    const stop = eta.departure !== eta.arrival && i > 0 && i < last ? `, départ ${clock(eta.departure)}` : '';
    const description = i === 0 ? `Départ ${time}`
      : `${KIND_TYPE[kind]} · km ${formatKm(eta.km)} · arrivée prévue ${time}${stop} (${plan.scenario.name.toLowerCase()})`;
    return [{
      index: i,
      name: options.timeInName ? `${eta.name} ${time}` : eta.name,
      description,
      kind,
      lat: marker.lat,
      lon: marker.lon,
      ele: marker.elevationM,
    }];
  });
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const coord = (v: number) => v.toFixed(6);

/** Fichier GPX du parcours : null sans trace GPX. */
export function buildCourseGpx(course: CourseView, plan: RacePlan, services: Service[][], options: GpxOptions): string | null {
  const track = course.track;
  if (!track || track.profile.length < 2) return null;
  const name = xml(course.race.name);
  const waypoints = gpxWaypoints(course, plan, services, options).map((w) => [
    `  <wpt lat="${coord(w.lat)}" lon="${coord(w.lon)}">`,
    `    <ele>${Math.round(w.ele)}</ele>`,
    `    <name>${xml(w.name)}</name>`,
    `    <desc>${xml(w.description)}</desc>`,
    `    <type>${xml(KIND_TYPE[w.kind])}</type>`,
    '  </wpt>',
  ].join('\n'));
  const points = track.profile.map((p) => `      <trkpt lat="${coord(p.lat)}" lon="${coord(p.lon)}"><ele>${Math.round(p.elevationM)}</ele></trkpt>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Ravitime" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${name}</name>`,
    `    <desc>${xml(`Plan Ravitime, scénario ${plan.scenario.name.toLowerCase()} : heures de passage prévues aux ravitos.`)}</desc>`,
    '  </metadata>',
    ...waypoints,
    '  <trk>',
    `    <name>${name}</name>`,
    '    <trkseg>',
    ...points,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

export function gpxFilename(raceName: string): string {
  return fitFilename(raceName).replace(/\.fit$/, '.gpx');
}
