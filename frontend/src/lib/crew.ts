import type { CourseView, RacePlan } from '../api/types';
import { durationMinutes, localMinutes } from './format';
import { bindingCutoff } from './plan';
import type { Fix } from './race';

/**
 * Ce que reçoit l'assistance, dans le lien lui-même (après #assistance=) : le plan, compressé.
 * Rien ne passe par le serveur. Les heures sont en minutes depuis le départ.
 */
export interface CrewShare {
  v: 1;
  /** Nom de la course, départ (ISO local), date d'envoi (ISO). */
  race: string;
  start: string;
  sentAt: string;
  /** Prénom ou surnom du coureur, facultatif. */
  runner: string | null;
  /** Noms des scénarios (optimiste, réaliste, prudent) et lequel sert d'heure probable. */
  scenarios: string[];
  likely: number;
  points: CrewPoint[];
  /** Index des points où l'assistance attend le coureur. */
  crew: number[];
  /** Dernier point où le coureur s'est signalé (recalage), en minutes depuis le départ. */
  fix: { index: number; at: number } | null;
}

export interface CrewPoint {
  code: string;
  name: string;
  km: number;
  lat: number | null;
  lon: number | null;
  /** Arrivée prévue dans chaque scénario, en minutes depuis le départ. */
  arrivals: number[];
  /** Barrière la plus contraignante, en minutes depuis le départ, et si elle est en sortie. */
  cutoff: number | null;
  cutoffOut: boolean;
  /** Le tronçon qui suit passe de nuit (au moins 15 min, scénario probable). */
  nightAfter: boolean;
  /** À préparer pour le coureur à ce point (points d'assistance seulement). */
  prepare: string[];
}

/** Le plan de chaque scénario, la course (positions des points) et ce que l'assistance prépare. */
export function buildShare(plans: RacePlan[], likely: number, course: CourseView, crew: string[],
  prepare: (index: number) => string[], fix: Fix | null, runner: string | null, now = new Date()): CrewShare {
  const base = plans[likely] ?? plans[0];
  const start = localMinutes(base.start);
  const crewIndexes = base.checkpoints.map((c, i) => (crew.includes(c.code) ? i : -1)).filter((i) => i >= 0);
  return {
    v: 1,
    race: course.race.name,
    start: base.start,
    sentAt: now.toISOString(),
    runner: runner?.trim() || null,
    scenarios: plans.map((p) => p.scenario.name),
    likely,
    points: base.checkpoints.map((eta, i) => {
      const marker = course.markers[i];
      const cutoff = bindingCutoff(eta);
      const next = base.checkpoints[i + 1];
      return {
        code: eta.code,
        name: eta.name,
        km: eta.km,
        lat: marker && course.track ? round5(marker.lat) : null,
        lon: marker && course.track ? round5(marker.lon) : null,
        arrivals: plans.map((p) => Math.round(localMinutes(p.checkpoints[i].arrival) - start)),
        cutoff: cutoff ? Math.round(localMinutes(cutoff.at) - start) : null,
        cutoffOut: cutoff?.out ?? false,
        nightAfter: !!next?.legNightDuration && durationMinutes(next.legNightDuration) >= 15,
        prepare: crewIndexes.includes(i) ? prepare(i) : [],
      };
    }),
    crew: crewIndexes,
    fix: fix ? { index: fix.index, at: Math.round(fix.atMinutes - start) } : null,
  };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

// --- Lien : JSON compressé (deflate) en base64 « URL » ---

const HASH_PREFIX = '#assistance=';

export function isCrewLink(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX);
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function encodeShare(share: CrewShare): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(share));
  return HASH_PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** null si le lien est abîmé (tronqué par une messagerie, par exemple). */
export async function decodeShare(hash: string): Promise<CrewShare | null> {
  if (!isCrewLink(hash)) return null;
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(HASH_PREFIX.length)), new DecompressionStream('deflate-raw'));
    const share = JSON.parse(new TextDecoder().decode(bytes)) as CrewShare;
    return share.v === 1 && Array.isArray(share.points) && share.points.length >= 2 ? share : null;
  } catch {
    return null;
  }
}

// --- Rendez-vous ---

/** Passage connu : le recalage du coureur (dans le lien), ou celui saisi par l'assistance s'il est plus loin. */
export function latestPass(share: CrewShare, own: { index: number; at: number } | null) {
  const runner = share.fix;
  if (!own) return runner;
  if (!runner) return own;
  return own.index >= runner.index ? own : runner;
}

/** Avance (négatif) ou retard (positif) sur l'heure probable, d'après le dernier passage connu. */
export function crewOffset(share: CrewShare, pass: { index: number; at: number } | null): number {
  return pass ? pass.at - share.points[pass.index].arrivals[share.likely] : 0;
}

export interface Meeting {
  index: number;
  early: number;
  likely: number;
  late: number;
  /** Heure conseillée pour être sur place : au plus tôt, moins la marge choisie. */
  beThere: number;
  /** Marge sur la barrière à l'heure probable ; null sans barrière. */
  margin: number | null;
  passed: boolean;
}

/** Créneau d'arrivée à un point (minutes depuis le départ), décalé d'après le dernier passage. */
export function meeting(share: CrewShare, index: number, pass: { index: number; at: number } | null, marginBefore: number): Meeting {
  const p = share.points[index];
  const shift = pass && index > pass.index ? crewOffset(share, pass) : 0;
  const arrivals = p.arrivals.map((a) => a + shift);
  const early = Math.min(...arrivals);
  const late = Math.max(...arrivals);
  const likely = pass && index === pass.index ? pass.at : arrivals[share.likely];
  return {
    index, early, likely, late, beThere: early - marginBefore,
    margin: p.cutoff === null ? null : p.cutoff - likely,
    passed: !!pass && index <= pass.index,
  };
}

/** Prochain point d'assistance encore à venir (ou le dernier, une fois tout passé). */
export function nextMeeting(share: CrewShare, pass: { index: number; at: number } | null, now: number): number | null {
  if (share.crew.length === 0) return null;
  const upcoming = share.crew.filter((i) => (!pass || i > pass.index) && meeting(share, i, pass, 0).late + 30 > now);
  return upcoming[0] ?? share.crew[share.crew.length - 1];
}
