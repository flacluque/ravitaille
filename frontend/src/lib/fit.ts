import type { CourseView, RacePlan, Service } from '../api/types';
import { durationMinutes, localMinutes } from './format';
import { estimatedMinutesAt } from './plan';

/**
 * Parcours pour montre Garmin (fichier FIT « course »), généré dans le navigateur : la trace, chaque point
 * du roadbook en point de parcours, et l'heure prévue à chaque point de la trace. La montre s'en sert pour
 * guider, alerter avant les ravitos et faire courir un partenaire virtuel au rythme du plan.
 * Le SDK FIT de Garmin n'est chargé qu'au premier export.
 */
export interface FitOptions {
  /** Ajoute l'heure de passage prévue par le plan à la fin du nom du point (« Greffeil 21h58 »). */
  timeInName: boolean;
  /** Garde aussi les pointages sans ravito. */
  checkpoints: boolean;
}

export type FitPointKind = 'start' | 'finish' | 'aid' | 'water' | 'checkpoint';

export interface FitCoursePoint {
  index: number;
  name: string;
  kind: FitPointKind;
  trackKm: number;
  lat: number;
  lon: number;
  /** Minutes depuis le départ (arrivée au point). */
  minutes: number;
}

/** Les montres n'affichent qu'une quinzaine de caractères, sans garantie pour les accents. */
const NAME_MAX = 15;

function ascii(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 '()-]/g, '').replace(/\s+/g, ' ').trim();
}

/** « 03:45 » ou ISO → « 3h45 ». */
function shortClock(iso: string): string {
  const m = localMinutes(iso);
  const day = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${Math.floor(day / 60)}h${String(day % 60).padStart(2, '0')}`;
}

/** Nom du point sur la montre : 15 caractères sans accents, l'heure prévue à la fin si demandé. */
export function fitPointName(name: string, kind: FitPointKind, timeIso: string | null, withTime: boolean): string {
  const tail = withTime && timeIso ? ` ${shortClock(timeIso)}` : '';
  const room = NAME_MAX - tail.length;
  let base = kind === 'start' ? 'Depart' : kind === 'finish' ? 'Arrivee' : ascii(name.replace(/\s*\(.*\)\s*$/, ''));
  if (base.length > room) base = base.split(/[ '-]/)[0];
  return base.slice(0, room).trim() + tail;
}

function pointKind(i: number, last: number, services: Service[]): FitPointKind {
  if (i === 0) return 'start';
  if (i === last) return 'finish';
  if (services.some((s) => s === 'COLD_FOOD' || s === 'HOT_FOOD' || s === 'DROP_BAG')) return 'aid';
  if (services.some((s) => s === 'WATER' || s === 'DRINKS')) return 'water';
  return 'checkpoint';
}

/** Points de parcours dans l'ordre de la trace, avec l'heure d'arrivée prévue (minutes depuis le départ). */
export function fitCoursePoints(course: CourseView, plan: RacePlan, services: Service[][], options: FitOptions): FitCoursePoint[] {
  const start = localMinutes(plan.start);
  const last = plan.checkpoints.length - 1;
  return plan.checkpoints.flatMap((eta, i) => {
    const marker = course.markers[i];
    if (!marker) return [];
    const kind = pointKind(i, last, services[i] ?? []);
    if (kind === 'checkpoint' && !options.checkpoints) return [];
    const time = i === 0 ? eta.departure : eta.arrival;
    return [{
      index: i,
      name: fitPointName(eta.name, kind, time, options.timeInName),
      kind,
      trackKm: marker.trackKm,
      lat: marker.lat,
      lon: marker.lon,
      minutes: localMinutes(time) - start,
    }];
  });
}

/**
 * Heure prévue (minutes depuis le départ) le long de la trace : les points de la trace, plus un second point à
 * chaque ravito pour l'arrêt (même position, heure de départ) : le partenaire virtuel s'arrête aussi.
 * Entre deux ravitos, le temps suit le terrain (km-effort) : le partenaire virtuel ralentit dans les montées.
 */
export function timedTrack(course: CourseView, plan: RacePlan): { km: number; lat: number; lon: number; ele: number; minutes: number }[] {
  const track = course.track;
  if (!track || course.markers.length !== plan.checkpoints.length) return [];
  const start = localMinutes(plan.start);
  const stops = course.markers.map((m, i) => ({ km: m.trackKm, eta: plan.checkpoints[i] }));
  const out: { km: number; lat: number; lon: number; ele: number; minutes: number }[] = [];
  let s = 0;
  for (const p of track.profile) {
    // Points de la trace jusqu'au prochain point du roadbook, puis ce point (arrivée et départ).
    while (s < stops.length && stops[s].km <= p.km) {
      const { km, eta } = stops[s];
      const m = course.markers[s];
      const arrive = localMinutes(eta.arrival) - start;
      out.push({ km, lat: m.lat, lon: m.lon, ele: m.elevationM, minutes: arrive });
      if (durationMinutes(eta.stop) > 0) out.push({ km, lat: m.lat, lon: m.lon, ele: m.elevationM, minutes: localMinutes(eta.departure) - start });
      s++;
    }
    if (p.km > stops[stops.length - 1].km) break;
    const minutes = estimatedMinutesAt(p.km, plan, course.markers, track.profile);
    if (minutes !== null && (out.length === 0 || p.km > out[out.length - 1].km)) {
      out.push({ km: p.km, lat: p.lat, lon: p.lon, ele: p.elevationM, minutes: minutes - start });
    }
  }
  // L'arrivée (et tout point au-delà du dernier point de la trace).
  for (; s < stops.length; s++) {
    const m = course.markers[s];
    out.push({ km: stops[s].km, lat: m.lat, lon: m.lon, ele: m.elevationM, minutes: localMinutes(stops[s].eta.arrival) - start });
  }
  return out;
}

const SEMICIRCLES = 2 ** 31 / 180;
// Types présents dès les premières versions du profil FIT : les plus récents (aidStation, checkpoint) s'affichent
// dans l'appli Garmin Connect mais peuvent être ignorés par la montre (constaté sur une Fenix 7).
const COURSE_POINT_TYPE: Record<FitPointKind, string> = {
  start: 'generic', finish: 'generic', aid: 'food', water: 'water', checkpoint: 'generic',
};

export function fitFilename(raceName: string): string {
  const slug = raceName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'parcours'}.fit`;
}

/** Fichier FIT du parcours : null sans trace GPX (la montre a besoin de la trace pour guider). */
export async function buildCourseFit(course: CourseView, plan: RacePlan, services: Service[][], options: FitOptions,
  now = new Date()): Promise<Uint8Array | null> {
  const records = timedTrack(course, plan);
  if (records.length < 2) return null;
  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const t0 = new Date(plan.start);
  const at = (minutes: number) => new Date(t0.getTime() + Math.round(minutes * 60) * 1000);
  const pos = (lat: number, lon: number) => ({ positionLat: Math.round(lat * SEMICIRCLES), positionLong: Math.round(lon * SEMICIRCLES) });
  const first = records[0];
  const lastRec = records[records.length - 1];
  const totalSeconds = Math.round((lastRec.minutes - first.minutes) * 60);
  const name = ascii(course.race.name).slice(0, 32) || 'Trail Planner';

  const encoder = new Encoder();
  // Les messages suivent le profil FIT (noms de champs en camelCase) ; le SDK convertit valeurs et unités.
  const write = (mesgNum: number, mesg: Record<string, unknown>) => encoder.onMesg(mesgNum, mesg);
  write(Profile.MesgNum.FILE_ID, { type: 'course', manufacturer: 'development', product: 0, timeCreated: now, serialNumber: 1 });
  write(Profile.MesgNum.COURSE, { name, sport: 'running', subSport: 'trail' });
  write(Profile.MesgNum.LAP, {
    timestamp: at(first.minutes), startTime: at(first.minutes),
    startPositionLat: pos(first.lat, first.lon).positionLat, startPositionLong: pos(first.lat, first.lon).positionLong,
    endPositionLat: pos(lastRec.lat, lastRec.lon).positionLat, endPositionLong: pos(lastRec.lat, lastRec.lon).positionLong,
    totalElapsedTime: totalSeconds, totalTimerTime: totalSeconds, totalDistance: lastRec.km * 1000,
    totalAscent: Math.round(plan.totalGainM),
  });
  write(Profile.MesgNum.EVENT, { timestamp: at(first.minutes), event: 'timer', eventType: 'start', eventGroup: 0 });
  for (const r of records) {
    write(Profile.MesgNum.RECORD, {
      timestamp: at(r.minutes), ...pos(r.lat, r.lon), distance: r.km * 1000, altitude: r.ele, enhancedAltitude: r.ele,
    });
  }
  write(Profile.MesgNum.EVENT, { timestamp: at(lastRec.minutes), event: 'timer', eventType: 'stopAll', eventGroup: 0 });
  for (const p of fitCoursePoints(course, plan, services, options)) {
    write(Profile.MesgNum.COURSE_POINT, {
      timestamp: at(p.minutes), ...pos(p.lat, p.lon), distance: p.trackKm * 1000, type: COURSE_POINT_TYPE[p.kind], name: p.name,
    });
  }
  return encoder.close();
}
