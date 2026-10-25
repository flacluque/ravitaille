import type { AidLevel, Checkpoint, ExtractedRoadbook, RaceDefinition, Service } from '../api/types';
import { defaultServices, sortServices } from './services';

/**
 * Roadbook tel que saisi dans l'éditeur : des champs texte, validés et convertis en RaceDefinition
 * seulement au moment du calcul.
 *
 * Les barrières se saisissent comme sur un roadbook papier ("14h30") : le jour est déduit, c'est la
 * première fois que cette heure est atteinte après la barrière précédente (ou le départ).
 * Limite : deux barrières successives à plus de 24 h d'écart ne sont pas représentables.
 */
export interface DraftCheckpoint {
  /** Identifiant stable pour React (le code peut être vide ou modifié pendant la saisie). */
  id: string;
  code: string;
  name: string;
  km: string;
  gainM: string;
  lossM: string;
  cutoffIn: string;
  cutoffOut: string;
  aid: AidLevel;
  services: Service[];
  /** Position sur la trace GPX placée sur la carte (km de la trace) ; absente : placée d'après le roadbook. */
  trackKm?: number | null;
}

export interface RaceDraft {
  name: string;
  /** "YYYY-MM-DDTHH:mm" (input datetime-local). */
  start: string;
  /** Plage frontale, "HH:mm". */
  nightStart: string;
  nightEnd: string;
  checkpoints: DraftCheckpoint[];
}

export interface NightWindow {
  nightStart: string;
  nightEnd: string;
}

export type DraftResult =
  | { ok: true; race: RaceDefinition; night: NightWindow }
  | { ok: false; errors: string[]; fields: FieldErrors };

/**
 * Erreur de chaque champ, pour l'afficher à côté : "name", "start", "night", ou "<id du point>.<champ>"
 * (km, gainM, lossM, cutoffIn, cutoffOut, code).
 */
export type FieldErrors = Record<string, string>;

let nextId = 0;
export function newId(): string {
  nextId += 1;
  return `cp-${Date.now().toString(36)}-${nextId}`;
}

export function emptyCheckpoint(partial: Partial<DraftCheckpoint> = {}): DraftCheckpoint {
  const aid = partial.aid ?? 'LIGHT';
  return {
    id: newId(), code: '', name: '', km: '', gainM: '', lossM: '', cutoffIn: '', cutoffOut: '',
    aid, services: defaultServices(aid), ...partial,
  };
}

/** Brouillon gardé dans le navigateur par une version sans services : on les déduit du type d'arrêt. */
export function normalizeDraft(draft: RaceDraft): RaceDraft {
  return {
    ...draft,
    checkpoints: draft.checkpoints.map((cp) => ({ ...cp, services: cp.services ?? defaultServices(cp.aid) })),
  };
}

export function emptyDraft(): RaceDraft {
  return {
    name: '',
    start: '',
    nightStart: '19:00',
    nightEnd: '07:45',
    checkpoints: [
      emptyCheckpoint({ code: 'D', name: 'Départ', km: '0', gainM: '0', lossM: '0', aid: 'NONE' }),
      emptyCheckpoint({ code: 'A', name: 'Arrivée', aid: 'NONE' }),
    ],
  };
}

/** "14h30", "14:30", "14h", "9h05" → minutes depuis minuit ; null si illisible. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2})\s*(?:h|:)\s*(\d{2})?$/i.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/\s/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** "2026-10-23T08:00" → minutes UTC "fictives" (temps local de course, sans fuseau). */
function toMinutes(iso: string): number | null {
  const m = LOCAL.exec(iso);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}

function fromMinutes(minutes: number): string {
  const d = new Date(minutes * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
}

/** Première occurrence de l'heure `clock` (minutes depuis minuit) à partir de `after` (inclus). */
function nextOccurrence(after: number, clock: number): number {
  const dayStart = Math.floor(after / 1440) * 1440;
  const candidate = dayStart + clock;
  return candidate >= after ? candidate : candidate + 1440;
}

/**
 * Date de chaque barrière, dans l'ordre du parcours. Sert à la conversion et à l'affichage du jour
 * déduit à côté de la saisie. null quand la saisie est vide ou illisible.
 */
export function resolveCutoffs(draft: RaceDraft): { cutoffIn: string | null; cutoffOut: string | null }[] {
  let previous = toMinutes(draft.start);
  return draft.checkpoints.map((cp) => {
    const resolve = (text: string): string | null => {
      const clock = parseClock(text);
      if (previous === null || clock === null) return null;
      previous = nextOccurrence(previous, clock);
      return fromMinutes(previous);
    };
    const cutoffIn = cp.cutoffIn.trim() ? resolve(cp.cutoffIn) : null;
    const cutoffOut = cp.cutoffOut.trim() ? resolve(cp.cutoffOut) : null;
    return { cutoffIn, cutoffOut };
  });
}

/** Valide la saisie et la convertit pour l'API. `hasTrack` : sans trace GPX, le D+ est obligatoire partout. */
export function draftToRace(draft: RaceDraft, hasTrack: boolean): DraftResult {
  const errors: string[] = [];
  const fields: FieldErrors = {};
  // Le message complet va dans la liste ; à côté du champ, une version courte suffit (le champ dit déjà où).
  const fail = (key: string | null, message: string, short = message) => {
    errors.push(message);
    if (key && !(key in fields)) fields[key] = short;
  };
  const cps = draft.checkpoints;

  if (!draft.name.trim()) fail('name', 'Donne un nom à la course.');
  if (toMinutes(draft.start) === null) fail('start', "Indique la date et l'heure de départ.");
  if (parseClock(draft.nightStart) === null || parseClock(draft.nightEnd) === null) {
    fail('night', 'Plage de nuit illisible (format 19h00).');
  }
  if (cps.length < 2) fail(null, 'Il faut au moins un départ et une arrivée.');

  const label = (cp: DraftCheckpoint, i: number) => `« ${cp.name.trim() || cp.code.trim() || `point ${i + 1}`} »`;
  const codes = cps.map((cp, i) => cp.code.trim() || String(i + 1));
  const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (duplicates.length) {
    fail(null, `Codes en double : ${[...new Set(duplicates)].join(', ')}.`);
    cps.forEach((cp, i) => { if (duplicates.includes(codes[i])) fields[`${cp.id}.code`] ??= 'Code en double.'; });
  }

  const resolved = resolveCutoffs(draft);
  const checkpoints: Checkpoint[] = [];
  let previousKm = -Infinity;
  let previousGain = 0;
  let previousLoss = 0;

  cps.forEach((cp, i) => {
    const km = parseNumber(cp.km);
    let gain = parseNumber(cp.gainM);
    let loss = parseNumber(cp.lossM);
    if (i === 0) {
      gain ??= 0;
      loss ??= 0;
    }

    if (km === null || Number.isNaN(km)) {
      fail(`${cp.id}.km`, `Kilométrage manquant pour ${label(cp, i)}.`, cp.km.trim() ? 'Nombre attendu' : 'Km manquant');
    } else if (i === 0 && km !== 0) {
      fail(`${cp.id}.km`, 'Le départ doit être au km 0.', 'Le départ est au km 0');
    } else if (km <= previousKm) {
      fail(`${cp.id}.km`, `Le km de ${label(cp, i)} doit être supérieur à celui du point précédent.`, 'Plus que le point d\'avant');
    }
    if (Number.isNaN(gain)) fail(`${cp.id}.gainM`, `D+ illisible pour ${label(cp, i)}.`, 'Nombre attendu');
    else if (gain === null && !hasTrack) fail(`${cp.id}.gainM`, `D+ manquant pour ${label(cp, i)} (obligatoire sans trace GPX).`, 'D+ manquant');
    else if (gain !== null && gain < previousGain) fail(`${cp.id}.gainM`, `Le D+ cumulé de ${label(cp, i)} est inférieur au précédent.`, 'Moins que le point d\'avant');
    if (Number.isNaN(loss)) fail(`${cp.id}.lossM`, `D- illisible pour ${label(cp, i)}.`, 'Nombre attendu');
    else if (loss !== null && loss < previousLoss) fail(`${cp.id}.lossM`, `Le D- cumulé de ${label(cp, i)} est inférieur au précédent.`, 'Moins que le point d\'avant');

    if (cp.cutoffIn.trim() && parseClock(cp.cutoffIn) === null) fail(`${cp.id}.cutoffIn`, `Barrière d'entrée illisible pour ${label(cp, i)} (format 14h30).`, 'Format 14h30');
    if (cp.cutoffOut.trim() && parseClock(cp.cutoffOut) === null) fail(`${cp.id}.cutoffOut`, `Barrière de sortie illisible pour ${label(cp, i)} (format 14h30).`, 'Format 14h30');

    if (typeof km === 'number' && !Number.isNaN(km)) previousKm = km;
    if (typeof gain === 'number' && !Number.isNaN(gain)) previousGain = gain;
    if (typeof loss === 'number' && !Number.isNaN(loss)) previousLoss = loss;

    checkpoints.push({
      code: codes[i],
      name: cp.name.trim() || codes[i],
      km: km ?? 0,
      gainM: gain === null || Number.isNaN(gain) ? null : gain,
      lossM: loss === null || Number.isNaN(loss) ? null : loss,
      cutoffIn: resolved[i].cutoffIn,
      cutoffOut: resolved[i].cutoffOut,
      aid: cp.aid,
      services: sortServices(cp.services),
      ...(hasTrack && typeof cp.trackKm === 'number' ? { trackKm: cp.trackKm } : {}),
    });
  });

  if (errors.length) return { ok: false, errors, fields };
  return {
    ok: true,
    race: { name: draft.name.trim(), start: fromMinutes(toMinutes(draft.start)!), maxDuration: null, checkpoints },
    night: { nightStart: formatClockInput(parseClock(draft.nightStart)!), nightEnd: formatClockInput(parseClock(draft.nightEnd)!) },
  };
}

/** 870 → "14:30" (format LocalTime attendu par l'API). */
function formatClockInput(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Erreurs champ par champ (vide si la saisie est valide). */
export function draftFieldErrors(draft: RaceDraft, hasTrack: boolean): FieldErrors {
  const result = draftToRace(draft, hasTrack);
  return result.ok ? {} : result.fields;
}

/** "2026-10-23T14:30:00" → "14h30" (champ de saisie d'une barrière). */
function clockText(iso: string | null): string {
  const m = iso ? LOCAL.exec(iso) : null;
  return m ? `${m[4]}h${m[5]}` : '';
}

/** Fichier roadbook (format de samples/<id>/roadbook.json, avec "night" en option) → brouillon. */
export function raceToDraft(race: RaceDefinition, night?: Partial<NightWindow>): RaceDraft {
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const hm = (t: string | undefined, fallback: string) => (t ? t.slice(0, 5) : fallback);
  return {
    name: race.name ?? '',
    start: race.start ? race.start.slice(0, 16) : '',
    nightStart: hm(night?.nightStart, '19:00'),
    nightEnd: hm(night?.nightEnd, '07:45'),
    checkpoints: (race.checkpoints ?? []).map((cp) => ({
      id: newId(),
      code: cp.code ?? '',
      name: cp.name ?? '',
      km: num(cp.km),
      gainM: num(cp.gainM),
      lossM: num(cp.lossM),
      cutoffIn: clockText(cp.cutoffIn),
      cutoffOut: clockText(cp.cutoffOut),
      aid: cp.aid ?? 'NONE',
      services: cp.services ?? defaultServices(cp.aid ?? 'NONE'),
      ...(typeof cp.trackKm === 'number' ? { trackKm: cp.trackKm } : {}),
    })),
  };
}

/** Lecture d'un fichier roadbook JSON importé ; message d'erreur lisible si le format ne colle pas. */
export function parseRoadbookFile(text: string): RaceDraft {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  const obj = data as Partial<RaceDefinition> & { night?: Partial<NightWindow>; race?: RaceDefinition };
  // On accepte aussi une requête de plan complète ({ race, night, ... }), comme requests/plan-bogomiles.json.
  const race = obj.race ?? (obj as RaceDefinition);
  if (!Array.isArray(race.checkpoints)) {
    throw new Error('Format inattendu : il manque la liste "checkpoints".');
  }
  return raceToDraft(race, obj.night);
}

/**
 * Brouillon → fichier JSON à garder (même format que les exemples embarqués, + la plage de nuit).
 * null tant que la saisie n'est pas valide.
 */
export function draftToFile(draft: RaceDraft): string | null {
  const result = draftToRace(draft, true);
  return result.ok ? JSON.stringify({ ...result.race, night: result.night }, null, 2) : null;
}

/**
 * Roadbook lu par l'IA → brouillon de l'éditeur. Ce qui n'a pas été lu (date, plage de nuit) est
 * repris de la saisie en cours ; les points à vérifier s'ajoutent aux remarques de l'IA.
 */
export function extractedToDraft(extracted: ExtractedRoadbook, current: RaceDraft, fileName = ''):
  { draft: RaceDraft; warnings: string[] } {
  const warnings = [...extracted.warnings];
  // Nom non lu : surtout ne pas garder celui de la course précédente, le plan d'une autre course
  // s'afficherait sous son nom. On part du nom du fichier.
  let name = extracted.name?.trim() ?? '';
  if (!name) {
    name = nameFromFile(fileName);
    warnings.push(name
      ? `Nom de la course non lu sur le roadbook : « ${name} » vient du nom du fichier, corrige-le si besoin.`
      : 'Nom de la course non lu sur le roadbook : indique-le.');
  }
  const currentDate = /^\d{4}-\d{2}-\d{2}/.exec(current.start)?.[0] ?? null;
  const currentTime = /T(\d{2}:\d{2})/.exec(current.start)?.[1] ?? null;
  const date = extracted.startDate ?? currentDate;
  const time = extracted.startTime ?? currentTime;
  if (!extracted.startDate) {
    warnings.push(date
      ? 'Date de départ non lue sur le roadbook : celle déjà saisie a été gardée, vérifie-la.'
      : `Date de départ non lue sur le roadbook : indique-la${time ? ` (heure lue : ${time.replace(':', 'h')})` : ''}.`);
  }
  const num = (v: number | null) => (v === null || v === undefined ? '' : String(v));
  return {
    warnings,
    draft: {
      name,
      start: date && time ? `${date}T${time}` : '',
      nightStart: current.nightStart,
      nightEnd: current.nightEnd,
      checkpoints: extracted.checkpoints.map((cp) => ({
        id: newId(),
        code: cp.code ?? '',
        name: cp.name ?? '',
        km: num(cp.km),
        gainM: num(cp.gainM),
        lossM: num(cp.lossM),
        cutoffIn: cp.cutoffIn ?? '',
        cutoffOut: cp.cutoffOut ?? '',
        aid: cp.aid ?? 'NONE',
        services: cp.services ?? [],
      })),
    },
  };
}

/** "roadbook_bogomiles-2026.jpg" → "Roadbook bogomiles 2026". */
function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : '';
}

/**
 * Positions placées sur la carte, point par point (null : position automatique). Les points de la course calculée
 * sont ceux du brouillon, dans le même ordre.
 */
export function withTrackPositions(draft: RaceDraft, positions: (number | null)[]): RaceDraft {
  return {
    ...draft,
    checkpoints: draft.checkpoints.map((cp, i) => {
      const { trackKm: _old, ...rest } = cp;
      const km = positions[i];
      return typeof km === 'number' ? { ...rest, trackKm: Math.round(km * 100) / 100 } : rest;
    }),
  };
}

/** Une autre trace GPX : les positions placées sur l'ancienne n'ont plus de sens. */
export function withoutTrackPositions(draft: RaceDraft): RaceDraft {
  if (!draft.checkpoints.some((cp) => typeof cp.trackKm === 'number')) return draft;
  return withTrackPositions(draft, []);
}

/** Vrai si l'éditeur contient déjà une saisie (au-delà du brouillon vide) : on demande avant d'écraser. */
export function hasContent(draft: RaceDraft): boolean {
  return draft.name.trim() !== ''
    || draft.checkpoints.length > 2
    || draft.checkpoints.some((cp, i) => i > 0 && (cp.km.trim() !== '' || cp.gainM.trim() !== '' || cp.cutoffIn.trim() !== ''));
}

/**
 * Empreinte de ce qui détermine le plan d'une course saisie : sert à savoir si le plan affiché
 * correspond encore à la saisie (les identifiants internes des points n'en font pas partie).
 */
export function draftSignature(draft: RaceDraft, gpx: { name: string; size: number } | null): string {
  const { checkpoints, ...race } = draft;
  return JSON.stringify({
    ...race,
    checkpoints: checkpoints.map(({ id: _id, ...cp }) => cp),
    gpx: gpx ? `${gpx.name}:${gpx.size}` : null,
  });
}
