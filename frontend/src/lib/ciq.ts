import type { CourseView, RacePlan, Service } from '../api/types';
import { localMinutes } from './format';
import { computeNutrition, MEAL_CARBS_G, type NutritionPlan, type NutritionProfile, type PointActions } from './nutrition';
import { gainAt } from './plan';

/**
 * Plan pour le champ de données Connect IQ « Trail Planner » : un texte compact que le coureur colle dans les
 * réglages du champ (appli Connect IQ du téléphone). Le champ en déduit, avec la distance et le temps de la
 * montre, le prochain ravito, l'écart au plan et l'heure d'arrivée estimée. Ce module en est aussi la
 * référence : le code Monkey C (connectiq/) reprend les mêmes calculs.
 *
 * Format v1 : TP1;<heure du départ, minutes>;<km-effort cumulé à chaque km de la trace, en dixièmes>;<ravitos>
 * Ravito : nom~km de la trace (dixièmes)~arrivée~départ (minutes depuis le départ)~à faire (séparés par ^),
 * ravitos séparés par |.
 */
export interface CiqRavito {
  name: string;
  /** Km de la trace. */
  km: number;
  /** Arrivée et départ prévus, en minutes depuis le départ. */
  arr: number;
  dep: number;
  todo: string[];
}

export interface CiqPlan {
  /** Heure du départ, en minutes depuis minuit. */
  startClock: number;
  /** Km-effort cumulé (1 km + 1 par 100 m de D+) à chaque km entier de la trace. */
  effort: number[];
  ravitos: CiqRavito[];
}

const NAME_MAX = 18;
const TODO_MAX = 26;
const TODO_COUNT = 4;

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

export function buildCiqPlan(course: CourseView, plan: RacePlan, services: Service[][], nutrition: NutritionProfile,
  crew: string[] = []): CiqPlan | null {
  const track = course.track;
  if (!track || course.markers.length !== plan.checkpoints.length) return null;
  const start = localMinutes(plan.start);
  const maxKm = track.profile[track.profile.length - 1]?.km ?? 0;
  const effort = Array.from({ length: Math.ceil(maxKm) + 1 }, (_, km) => km + gainAt(track.profile, km) / 100);
  const n = computeNutrition(plan, services, nutrition, crew);
  const last = plan.checkpoints.length - 1;
  const ravitos = plan.checkpoints.map((eta, i) => {
    return {
      name: shortName(i === 0 ? 'Départ' : i === last ? 'Arrivée' : eta.name),
      km: course.markers[i].trackKm,
      arr: localMinutes(i === 0 ? eta.departure : eta.arrival) - start,
      dep: localMinutes(eta.departure) - start,
      todo: i === last ? [] : watchTodo(n.points[i], n, nutrition, i === 0).slice(0, TODO_COUNT).map((a) => clean(a, TODO_MAX)),
    };
  });
  return { startClock: Math.round(start) % 1440, effort, ravitos };
}

/**
 * Ce qu'il y a à faire au point, en lignes courtes pour l'écran de la montre (« Remplir 2 flasques »,
 * « Repas chaud », « +2 Gel Décathlon »), plutôt que les phrases de l'appli.
 */
export function watchTodo(p: PointActions, n: NutritionPlan, profile: NutritionProfile, start: boolean): string[] {
  const lines: string[] = [];
  if (p.fillFlasks > 0) {
    const verb = start ? 'Partir avec' : 'Remplir';
    lines.push(`${verb} ${p.fillFlasks} flasque${p.fillFlasks > 1 ? 's' : ''}`);
    if (p.fillDrinkFlasks > 0 && n.drink) lines.push(`dont ${p.fillDrinkFlasks} de ${n.drink.name}`);
  }
  if (p.eatG > 0) lines.push(p.eatG >= MEAL_CARBS_G ? 'Repas chaud' : `Manger env. ${p.eatG} g`);
  const products = new Map(profile.products.map((x) => [x.id, x.name]));
  for (const [id, count] of Object.entries(p.take)) if (count > 0) lines.push(`+${count} ${products.get(id) ?? id}`);
  if (p.takeDrinkDoses > 0 && n.drink) lines.push(`+${p.takeDrinkDoses} dose${p.takeDrinkDoses > 1 ? 's' : ''} ${n.drink.name}`);
  return lines;
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

/** Km-effort cumulé au km `km`, interpolé dans la table. */
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
 * compte pas comme du retard ; entre deux ravitos, le temps prévu suit le terrain (km-effort).
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
