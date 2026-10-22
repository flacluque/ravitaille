import type { CourseView, RacePlan } from '../api/types';
import { localMinutes } from './format';
import { terrainEffortAt } from './plan';

/**
 * Plan pour le champ de données Connect IQ « Trail Planner » : un texte compact que le coureur colle dans les
 * réglages du champ (appli Connect IQ du téléphone). Le champ en déduit, avec la distance et le temps de la
 * montre, le prochain ravito, l'écart au plan et l'heure d'arrivée estimée. Ce module en est aussi la
 * référence : le code Monkey C (connectiq/) reprend les mêmes calculs.
 *
 * Format v1 : TP1;<heure du départ, minutes>;<effort selon la pente cumulé à chaque km de la trace, en dixièmes>;<ravitos>
 * Ravito : nom~km de la trace (dixièmes)~arrivée~départ (minutes depuis le départ)~à faire (séparés par ^,
 * laissé vide pour l'instant : le champ n'affiche pas de consignes), ravitos séparés par |.
 */
export interface CiqRavito {
  name: string;
  /** Km de la trace. */
  km: number;
  /** Arrivée et départ prévus, en minutes depuis le départ. */
  arr: number;
  dep: number;
  /** Consignes au ravito : non utilisées par le champ pour l'instant (toujours vide). */
  todo: string[];
}

export interface CiqPlan {
  /** Heure du départ, en minutes depuis minuit. */
  startClock: number;
  /** Effort selon la pente (montées et descentes, voir terrainFactor) cumulé à chaque km entier de la trace. */
  effort: number[];
  ravitos: CiqRavito[];
}

const NAME_MAX = 18;

/** Retire les séparateurs du format et coupe à la longueur voulue. */
function clean(text: string, max: number): string {
  return text.replace(/[;|~^]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** Nom lisible sur la montre : sans la parenthèse, et réduit au premier mot s'il est trop long. */
function shortName(name: string): string {
  let base = clean(name.replace(/\s*\(.*\)\s*$/, ''), 60);
  if (base.length > NAME_MAX) base = base.split(/[ '-]/)[0];
  return base.slice(0, NAME_MAX);
}

export function buildCiqPlan(course: CourseView, plan: RacePlan): CiqPlan | null {
  const track = course.track;
  if (!track || course.markers.length !== plan.checkpoints.length) return null;
  const start = localMinutes(plan.start);
  const maxKm = track.profile[track.profile.length - 1]?.km ?? 0;
  const effort = Array.from({ length: Math.ceil(maxKm) + 1 }, (_, km) => terrainEffortAt(track.profile, km));
  const last = plan.checkpoints.length - 1;
  const ravitos = plan.checkpoints.map((eta, i) => {
    return {
      name: shortName(i === 0 ? 'Départ' : i === last ? 'Arrivée' : eta.name),
      km: course.markers[i].trackKm,
      arr: localMinutes(i === 0 ? eta.departure : eta.arrival) - start,
      dep: localMinutes(eta.departure) - start,
      todo: [],
    };
  });
  return { startClock: Math.round(start) % 1440, effort, ravitos };
}

export function encodeCiqPlan(p: CiqPlan): string {
  return [
    'TP1',
    String(p.startClock),
    p.effort.map((e) => Math.round(e * 10)).join(','),
    p.ravitos.map((r) => [r.name, Math.round(r.km * 10), Math.round(r.arr), Math.round(r.dep), r.todo.join('^')].join('~')).join('|'),
  ].join(';');
}

/** Lecture du code, comme le fait le champ ; null si le code est abîmé. */
export function decodeCiqPlan(code: string): CiqPlan | null {
  const parts = code.trim().split(';');
  if (parts.length !== 4 || parts[0] !== 'TP1') return null;
  const effort = parts[2].split(',').map((v) => Number(v) / 10);
  const ravitos = parts[3].split('|').map((r) => {
    const f = r.split('~');
    return { name: f[0], km: Number(f[1]) / 10, arr: Number(f[2]), dep: Number(f[3]), todo: f[4] ? f[4].split('^') : [] };
  });
  if (ravitos.length < 2 || effort.some(Number.isNaN) || ravitos.some((r) => Number.isNaN(r.km + r.arr + r.dep))) return null;
  return { startClock: Number(parts[1]), effort, ravitos };
}

/** Effort selon la pente cumulé au km `km`, interpolé dans la table. */
export function ciqEffortAt(p: CiqPlan, km: number): number {
  const e = p.effort;
  if (km <= 0) return e[0] ?? 0;
  const i = Math.floor(km);
  if (i >= e.length - 1) return e[e.length - 1] + (km - (e.length - 1));
  return e[i] + (e[i + 1] - e[i]) * (km - i);
}

/** Zone autour d'un ravito où l'on considère le coureur arrêté au ravito (km). */
export const CIQ_AT_RAVITO_KM = 0.1;

/**
 * Écart au plan (minutes, positif = retard) avec `km` parcourus en `elapsed` minutes. Au ravito, l'arrêt prévu ne
 * compte pas comme du retard ; entre deux ravitos, le temps prévu suit le terrain (montées et descentes).
 */
export function ciqGap(p: CiqPlan, km: number, elapsed: number): number {
  const rs = p.ravitos;
  for (const r of rs) {
    if (Math.abs(km - r.km) <= CIQ_AT_RAVITO_KM) {
      if (elapsed < r.arr) return elapsed - r.arr;
      if (elapsed <= r.dep) return 0;
      return elapsed - r.dep;
    }
  }
  for (let i = 1; i < rs.length; i++) {
    if (km < rs[i].km || i === rs.length - 1) {
      const a = rs[i - 1];
      const b = rs[i];
      const e0 = ciqEffortAt(p, a.km);
      const total = ciqEffortAt(p, b.km) - e0;
      const share = total > 0 ? Math.min(1, Math.max(0, (ciqEffortAt(p, km) - e0) / total)) : 0;
      return elapsed - (a.dep + (b.arr - a.dep) * share);
    }
  }
  return 0;
}

/** Index du prochain ravito (au-delà de la zone du ravito où l'on est), ou le dernier. */
export function ciqNext(p: CiqPlan, km: number): number {
  const i = p.ravitos.findIndex((r, k) => k > 0 && r.km > km + CIQ_AT_RAVITO_KM);
  return i < 0 ? p.ravitos.length - 1 : i;
}
