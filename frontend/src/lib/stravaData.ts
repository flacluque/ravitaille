import type { StoredRunnerProfile } from '../api/storage';
import type { Reference, StravaActivity } from '../api/types';
import { activityTime } from './strava';

/**
 * Données Strava gardées par l'appli, selon la politique API de Strava :
 * - une valeur lue sur Strava (distance, D+, temps d'une sortie importée en référence) reste 7 jours au plus sans être
 *   vérifiée de nouveau (§6.2) ;
 * - une activité supprimée sur Strava disparaît de l'appli (§6.3) : vérification une fois par jour quand Strava est
 *   connecté ;
 * - les données dérivées (profil de coureur, fatigue d'une course) restent tant qu'elles servent, et s'effacent si leur
 *   activité disparaît ou si le coureur déconnecte Strava (§7.4).
 */

export const STRAVA_MAX_AGE_DAYS = 7;
export const STRAVA_RECHECK_HOURS = 24;

const DAY = 24 * 3600 * 1000;

export const fromStrava = (r: Reference): boolean => r.strava !== undefined;

/** Ce que l'appli garde de Strava, à vérifier. */
export interface StravaHeld {
  references: Reference[];
  runner: StoredRunnerProfile;
}

export function holdsStravaData({ references, runner }: StravaHeld): boolean {
  return references.some(fromStrava) || runner.profile !== null || runner.races.length > 0;
}

/** Vrai quand la dernière vérification date de plus d'un jour (ou n'a jamais eu lieu). */
export function needsCheck(lastCheck: string | null, now = new Date()): boolean {
  return !lastCheck || now.getTime() - new Date(lastCheck).getTime() > STRAVA_RECHECK_HOURS * 3600 * 1000;
}

/** Première date à relire sur Strava pour tout vérifier (« 2026-04-12 »), null s'il n'y a rien à vérifier. */
export function checkSince({ references, runner }: StravaHeld, now = new Date()): string | null {
  const dates = [
    ...references.filter(fromStrava).map((r) => r.date),
    runner.profile ? runner.profile.from : null,
    ...runner.races.map((r) => r.date),
  ].filter((d): d is string => !!d);
  if (!holdsStravaData({ references, runner })) return null;
  // Une donnée sans date : on relit l'année écoulée (comme la mesure du profil).
  const earliest = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : new Date(now.getTime() - 365 * DAY).toISOString().slice(0, 10);
  // Un jour de marge : la date locale d'une sortie peut précéder sa date UTC.
  return new Date(new Date(`${earliest}T00:00:00Z`).getTime() - DAY).toISOString().slice(0, 10);
}

export interface Reconciled extends StravaHeld {
  /** Références retirées : leur activité n'est plus sur Strava. */
  removedReferences: number;
  /** Profil effacé : une de ses activités n'est plus sur Strava. */
  profileRemoved: boolean;
  removedRaces: number;
  /** Une référence a changé de valeur (modifiée sur Strava) : le plan est à recalculer. */
  changed: boolean;
}

/** Remet ce que l'appli garde en accord avec les activités Strava du coureur, lues à l'instant. */
export function reconcile(held: StravaHeld, activities: StravaActivity[], now = new Date()): Reconciled {
  const byId = new Map(activities.map((a) => [a.id, a]));
  let removedReferences = 0;
  let changed = false;
  const references: Reference[] = [];
  for (const r of held.references) {
    if (!r.strava) {
      references.push(r);
      continue;
    }
    const a = byId.get(r.strava.id);
    if (!a) {
      removedReferences++;
      changed = true;
      continue;
    }
    const next: Reference = {
      ...r,
      label: a.name || r.label,
      date: a.date,
      km: a.distanceKm,
      gainM: Math.round(a.elevationGainM),
      time: activityTime(a),
      strava: { id: a.id, checkedAt: now.toISOString() },
    };
    if (next.label !== r.label || next.date !== r.date || next.km !== r.km || next.gainM !== r.gainM || next.time !== r.time) {
      changed = true;
    }
    references.push(next);
  }
  const profileRemoved = held.runner.profile !== null && held.runner.sources.some((id) => !byId.has(id));
  const races = held.runner.races.filter((r) => byId.has(r.activityId));
  const removedRaces = held.runner.races.length - races.length;
  const profile = profileRemoved ? null : held.runner.profile;
  const runner: StoredRunnerProfile = {
    ...held.runner,
    profile,
    sources: profile ? held.runner.sources : [],
    measuredAt: profile ? held.runner.measuredAt : null,
    races,
    use: held.runner.use && (profile !== null || races.length > 0),
  };
  return { references, runner, removedReferences, profileRemoved, removedRaces, changed };
}

/**
 * Sans vérification possible (hors ligne) : les références Strava vérifiées il y a plus de 7 jours sont retirées. Les
 * données dérivées restent (elles s'effaceront à la déconnexion ou si leur activité disparaît).
 */
export function expireReferences(references: Reference[], now = new Date()): { references: Reference[]; removed: number } {
  const kept = references.filter((r) => !r.strava || now.getTime() - new Date(r.strava.checkedAt).getTime() <= STRAVA_MAX_AGE_DAYS * DAY);
  return { references: kept, removed: references.length - kept.length };
}

/** Strava déconnecté ou accès révoqué : tout ce qui vient de Strava est effacé (§7.4). */
export function purgeStrava(references: Reference[]): Reference[] {
  return references.filter((r) => !r.strava);
}

/** Ce que la vérification a décidé ; l'appli l'applique (voir App). */
export type StravaCheck =
  /** Rien à vérifier, ou déjà vérifié aujourd'hui. */
  | { kind: 'skip' }
  /** Strava n'est plus connecté (déconnecté, accès révoqué) : tout ce qui vient de Strava est effacé. */
  | { kind: 'purge' }
  /** Vérifié sur Strava. */
  | { kind: 'reconciled'; result: Reconciled }
  /** Strava injoignable : les références trop anciennes sont retirées. */
  | { kind: 'expired'; references: Reference[]; removed: number };

export interface StravaApi {
  status: () => Promise<{ configured: boolean; connected: boolean }>;
  activities: (after: string) => Promise<StravaActivity[]>;
}

/** Vérification au lancement (et au retour dans l'appli) : statut de la connexion, puis une lecture des activités. */
export async function checkStrava(held: StravaHeld, lastCheck: string | null, api: StravaApi, now = new Date()): Promise<StravaCheck> {
  if (!holdsStravaData(held) || !needsCheck(lastCheck, now)) return { kind: 'skip' };
  const offline = (): StravaCheck => ({ kind: 'expired', ...expireReferences(held.references, now) });
  let status;
  try {
    status = await api.status();
  } catch {
    return offline();
  }
  // Serveur sans application Strava (en local) : rien à vérifier ni à effacer, les références expirent seules.
  if (!status.configured) return offline();
  if (!status.connected) return { kind: 'purge' };
  try {
    const since = checkSince(held, now)!;
    return { kind: 'reconciled', result: reconcile(held, await api.activities(since), now) };
  } catch (e) {
    // 401 : Strava a refusé l'accès (révoqué depuis les réglages Strava) ; le serveur a oublié la connexion.
    if ((e as { status?: number }).status === 401) return { kind: 'purge' };
    return offline();
  }
}

/** Phrase de confirmation de ce qui a été retiré, null si rien. */
export function reconcileNotice(r: Pick<Reconciled, 'removedReferences' | 'profileRemoved' | 'removedRaces'>): string | null {
  const parts: string[] = [];
  if (r.removedReferences) parts.push(`${r.removedReferences} référence${r.removedReferences > 1 ? 's' : ''}`);
  if (r.profileRemoved) parts.push('ton profil de coureur');
  if (r.removedRaces) parts.push(`${r.removedRaces} retour${r.removedRaces > 1 ? 's' : ''} de course`);
  if (!parts.length) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0];
  return `Des activités ont été supprimées de ton compte Strava. Ravitime a effacé ce qui en venait : ${list}.`;
}
