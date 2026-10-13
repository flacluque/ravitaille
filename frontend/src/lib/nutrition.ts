import type { RacePlan, Service } from '../api/types';
import { durationMinutes, formatClockFromMinutes, localMinutes } from './format';

/**
 * Plan de nutrition et d'hydratation, tronçon par tronçon, à partir du plan de course.
 *
 * - Objectif d'un tronçon : durée × glucides par heure, un quart de moins la première heure (l'estomac se
 *   met en route) et 10 % de moins la nuit (digestion plus lente).
 * - Ravitos : si le coureur y mange, un ravito avec du solide compte pour ≈ 30 g, un repas chaud ≈ 60 g.
 * - Eau : on remplit ses flasques à chaque point d'eau pour tenir jusqu'au suivant ; les flasques de
 *   boisson énergétique d'abord, dont les glucides sont décomptés.
 * - Le reste : les produits du coureur (gels, solides), pris à tour de rôle. On porte depuis le départ
 *   ce qu'il faut jusqu'au prochain point d'assistance ou sac de délestage, qui donne la suite.
 *
 * Repères courants en ultra, à ajuster par chacun : ce ne sont pas des conseils médicaux.
 */

export type ProductKind = 'GEL' | 'SOLID' | 'DRINK';

export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  /** Glucides par unité ; pour une boisson, par flasque remplie. */
  carbsG: number;
  /** Utilisé dans le plan (on garde les autres sous la main). */
  enabled: boolean;
}

export interface NutritionProfile {
  carbsPerHour: number;
  waterDayMlPerHour: number;
  waterNightMlPerHour: number;
  flasks: number;
  flaskMl: number;
  /** Flasques remplies de boisson énergétique à chaque remplissage (les autres : eau). */
  drinkFlasks: number;
  /** Le coureur mange aux ravitos : leurs glucides sont décomptés. */
  eatAtAid: boolean;
  products: Product[];
}

export const CARB_LEVELS = [
  { value: 60, label: 'je débute' },
  { value: 75, label: 'habitué' },
  { value: 90, label: 'ventre entraîné' },
];

export const KIND_LABELS: Record<ProductKind, string> = { GEL: 'Gel', SOLID: 'Solide', DRINK: 'Boisson' };

/** Glucides apportés par un ravito où l'on mange. */
export const AID_CARBS_G = 30;
export const MEAL_CARBS_G = 60;
export const FIRST_HOUR_FACTOR = 0.75;
export const NIGHT_FACTOR = 0.9;

export const DEFAULT_PROFILE: NutritionProfile = {
  carbsPerHour: 70,
  waterDayMlPerHour: 500,
  waterNightMlPerHour: 400,
  flasks: 3,
  flaskMl: 500,
  drinkFlasks: 2,
  eatAtAid: true,
  products: [
    { id: 'gel', name: 'Gel Décathlon', kind: 'GEL', carbsG: 40, enabled: true },
    { id: 'compote', name: 'Compote Baouw', kind: 'SOLID', carbsG: 30, enabled: true },
    { id: 'meltonic', name: 'Meltonic', kind: 'DRINK', carbsG: 30, enabled: true },
  ],
};

/**
 * Profil enregistré (éventuellement par une version précédente) → profil complet et cohérent :
 * anciens types de produit (compote, barre…) ramenés à « solide », part 0 = produit désactivé.
 */
export function normalizeProfile(raw: unknown): NutritionProfile {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  const flasks = Math.round(num(p.flasks, DEFAULT_PROFILE.flasks, 1, 6));
  const products = Array.isArray(p.products)
    ? (p.products as Record<string, unknown>[]).flatMap((q, i) => {
      if (!q || typeof q.name !== 'string' || typeof q.carbsG !== 'number') return [];
      const kind: ProductKind = q.kind === 'DRINK' ? 'DRINK' : q.kind === 'GEL' ? 'GEL' : 'SOLID';
      const enabled = typeof q.enabled === 'boolean' ? q.enabled : kind === 'DRINK' || q.share === undefined || (q.share as number) > 0;
      return [{ id: typeof q.id === 'string' ? q.id : `p${i}`, name: q.name, kind, carbsG: Math.max(0, q.carbsG), enabled }];
    })
    : DEFAULT_PROFILE.products;
  return {
    carbsPerHour: num(p.carbsPerHour, DEFAULT_PROFILE.carbsPerHour, 0, 150),
    waterDayMlPerHour: num(p.waterDayMlPerHour, DEFAULT_PROFILE.waterDayMlPerHour, 0, 2000),
    waterNightMlPerHour: num(p.waterNightMlPerHour, DEFAULT_PROFILE.waterNightMlPerHour, 0, 2000),
    flasks,
    flaskMl: num(p.flaskMl, DEFAULT_PROFILE.flaskMl, 100, 1500),
    drinkFlasks: Math.round(Math.min(flasks, num(p.drinkFlasks, DEFAULT_PROFILE.drinkFlasks, 0, 6))),
    eatAtAid: typeof p.eatAtAid === 'boolean' ? p.eatAtAid : DEFAULT_PROFILE.eatAtAid,
    products,
  };
}

export type Items = Record<string, number>;

export interface LegNutrition {
  /** Indice du point d'arrivée du tronçon dans le plan. */
  index: number;
  minutes: number;
  nightMinutes: number;
  /** Objectif du tronçon (modulé : première heure, nuit). */
  targetG: number;
  /** Glucides mangés au ravito de départ du tronçon. */
  aidCarbsG: number;
  /** Boisson énergétique bue sur le tronçon et ses glucides. */
  drinkMl: number;
  drinkCarbsG: number;
  /** Produits à prendre sur le tronçon, dans l'ordre (ids). */
  sequence: string[];
  itemsCarbsG: number;
  waterMl: number;
  /** Flasques remplies au départ du tronçon (sinon : la fin de celles du tronçon précédent). */
  refilled: boolean;
  flasks: number;
  drinkFlasks: number;
}

/** Ce qu'il faut faire à un point (départ compris). */
export interface PointActions {
  index: number;
  /** Flasques à remplir ici pour tenir jusqu'au prochain point d'eau (0 si pas de point d'eau). */
  fillFlasks: number;
  fillDrinkFlasks: number;
  /** Glucides à manger ici (ravito). */
  eatG: number;
  /** Ton assistance t'attend ici. */
  crew: boolean;
  /** Sac de délestage. */
  dropBag: boolean;
  /** Produits et doses de boisson à prendre ici (départ, assistance, sac) pour tenir jusqu'au suivant. */
  take: Items;
  takeDrinkDoses: number;
}

export interface NutritionPlan {
  legs: LegNutrition[];
  points: PointActions[];
  totals: { carbsG: number; waterMl: number; items: Items; drinkDoses: number; aidCarbsG: number };
  alerts: string[];
  drink: Product | null;
  foods: Product[];
}

/**
 * @param services services de chaque point du plan (même ordre que plan.checkpoints)
 * @param crew     codes des points où l'assistance attend le coureur
 */
export function computeNutrition(plan: RacePlan, services: Service[][], profile: NutritionProfile, crew: string[] = []): NutritionPlan {
  const etas = plan.checkpoints;
  const last = etas.length - 1;
  const drink = profile.drinkFlasks > 0 ? profile.products.find((p) => p.enabled && p.kind === 'DRINK') ?? null : null;
  const foods = profile.products.filter((p) => p.enabled && p.kind !== 'DRINK' && p.carbsG > 0);
  const alerts: string[] = [];
  const has = (i: number, s: Service) => (services[i] ?? []).includes(s);
  const canRefill = (i: number) => i === 0 || (i < last && (has(i, 'WATER') || has(i, 'DRINKS')));
  const isCrew = (i: number) => i > 0 && i < last && crew.includes(etas[i].code);
  const canRestock = (i: number) => i === 0 || isCrew(i) || (i > 0 && i < last && has(i, 'DROP_BAG'));
  const eatAt = (i: number) => (!profile.eatAtAid || i === 0 || i >= last ? 0
    : has(i, 'HOT_FOOD') ? MEAL_CARBS_G : has(i, 'COLD_FOOD') ? AID_CARBS_G : 0);

  // --- Objectif par tronçon ---
  const legs: LegNutrition[] = [];
  for (let i = 1; i <= last; i++) {
    const minutes = Math.max(0, durationMinutes(etas[i].legDuration));
    const night = Math.min(minutes, Math.max(0, durationMinutes(etas[i].legNightDuration ?? 'PT0S')));
    const end = durationMinutes(etas[i].elapsed);
    const start = end - minutes;
    const firstHour = Math.max(0, Math.min(end, 60) - Math.max(start, 0));
    const effective = minutes - (1 - FIRST_HOUR_FACTOR) * firstHour - (1 - NIGHT_FACTOR) * night;
    legs.push({
      index: i, minutes, nightMinutes: night,
      targetG: (profile.carbsPerHour * effective) / 60,
      aidCarbsG: eatAt(i - 1),
      drinkMl: 0, drinkCarbsG: 0, sequence: [], itemsCarbsG: 0,
      waterMl: (profile.waterDayMlPerHour * (minutes - night) + profile.waterNightMlPerHour * night) / 60,
      refilled: false, flasks: 0, drinkFlasks: 0,
    });
  }

  const points: PointActions[] = etas.map((_, i) => ({
    index: i, fillFlasks: 0, fillDrinkFlasks: 0, eatG: i > 0 ? eatAt(i) : 0, crew: isCrew(i),
    dropBag: i > 0 && i < last && has(i, 'DROP_BAG'), take: {}, takeDrinkDoses: 0,
  }));

  // --- Eau : d'un point d'eau au suivant, les flasques de boisson d'abord ---
  const capacity = profile.flasks * profile.flaskMl;
  for (let from = 0; from < last; ) {
    let to = from + 1;
    while (to < last && !canRefill(to)) to++;
    const segment = legs.slice(from, to);   // tronçons from+1 .. to
    const water = segment.reduce((s, l) => s + l.waterMl, 0);
    const flasks = Math.min(profile.flasks, Math.max(1, Math.ceil(water / profile.flaskMl - 0.05)));
    const drinkFlasks = drink ? Math.min(profile.drinkFlasks, flasks) : 0;
    points[from].fillFlasks = flasks;
    points[from].fillDrinkFlasks = drinkFlasks;
    if (water > capacity + 50) {
      alerts.push(`${pointName(plan, from)} → ${pointName(plan, to)} : environ ${liters(water)} à boire pour ${liters(capacity)} `
        + `de flasques. Bois bien avant de repartir, ou emporte une flasque de plus.`);
    }
    // On boit l'eau et la boisson au même rythme : la part de boisson suit la part de flasques.
    const drinkShare = flasks > 0 ? drinkFlasks / flasks : 0;
    segment.forEach((leg, k) => {
      leg.refilled = k === 0;
      leg.flasks = flasks;
      leg.drinkFlasks = drinkFlasks;
      leg.drinkMl = Math.min(leg.waterMl * drinkShare, drinkFlasks * profile.flaskMl);
      leg.drinkCarbsG = drink ? (leg.drinkMl / profile.flaskMl) * drink.carbsG : 0;
    });
    from = to;
  }

  // --- Produits : complètent ravito et boisson, à tour de rôle ; le reste d'un tronçon passe au suivant ---
  const counts: Items = Object.fromEntries(foods.map((p) => [p.id, 0]));
  let deficit = 0;
  let turn = 0;
  const minCarbs = foods.length ? Math.min(...foods.map((p) => p.carbsG)) : 0;
  for (const leg of legs) {
    const need = leg.targetG - leg.aidCarbsG - leg.drinkCarbsG + deficit;
    let covered = 0;
    while (foods.length && covered < need - minCarbs / 2) {
      const p = foods[turn % foods.length];
      turn++;
      counts[p.id] += 1;
      leg.sequence.push(p.id);
      covered += p.carbsG;
    }
    leg.itemsCarbsG = covered;
    // Un excédent (gros repas au ravito) n'avance que d'un peu le tronçon suivant.
    deficit = Math.max(-20, need - covered);
  }

  // --- Réapprovisionnement : on porte jusqu'au prochain point d'assistance ou sac de délestage ---
  for (let from = 0; from < last; ) {
    let to = from + 1;
    while (to < last && !canRestock(to)) to++;
    const take: Items = {};
    for (const leg of legs.slice(from, to)) {
      for (const id of leg.sequence) take[id] = (take[id] ?? 0) + 1;
    }
    points[from].take = take;
    // Doses pour les remplissages à faire soi-même d'ici le prochain réapprovisionnement. Au départ et
    // auprès de l'assistance, les flasques sont préparées à l'avance ; au sac de délestage, on remplit soi-même.
    let doses = 0;
    for (let i = from; i < to; i++) {
      if (i > from || (i > 0 && !points[i].crew)) doses += points[i].fillDrinkFlasks;
    }
    points[from].takeDrinkDoses = drink ? doses : 0;
    from = to;
  }

  const total = (pick: (l: LegNutrition) => number) => legs.reduce((s, l) => s + pick(l), 0);
  return {
    legs,
    points,
    totals: {
      carbsG: total((l) => l.aidCarbsG + l.drinkCarbsG + l.itemsCarbsG),
      waterMl: total((l) => l.waterMl),
      items: counts,
      drinkDoses: drink ? points.reduce((s, p) => s + p.fillDrinkFlasks, 0) : 0,
      aidCarbsG: total((l) => l.aidCarbsG),
    },
    alerts,
    drink,
    foods,
  };
}

function pointName(plan: RacePlan, i: number): string {
  return plan.checkpoints[i]?.name ?? `point ${i + 1}`;
}

export function liters(ml: number): string {
  return `${(ml / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** { gel: 2, compote: 1 } → "2 Gel Décathlon, 1 Compote Baouw" (dans l'ordre du profil). */
export function describeItems(items: Items, products: Product[]): string {
  return products
    .filter((p) => (items[p.id] ?? 0) > 0)
    .map((p) => `${items[p.id]} ${p.name}`)
    .join(', ');
}

/** "Remplir 3 flasques (dont 2 de Meltonic)", "3 flasques de Meltonic", "2 flasques d'eau". */
export function describeFill(flasks: number, drinkFlasks: number, n: NutritionPlan, verb = 'Remplir'): string {
  const base = `${verb} ${plural(flasks, 'flasque')}`;
  if (!n.drink || drinkFlasks === 0) return `${base} d'eau`;
  if (drinkFlasks >= flasks) return `${base} de ${n.drink.name}`;
  return `${base} (dont ${drinkFlasks} de ${n.drink.name})`;
}

/** Produits et doses à prendre : "4 Gel Décathlon, 2 Compote Baouw, 4 doses de Meltonic". */
export function describeTake(p: PointActions, n: NutritionPlan, profile: NutritionProfile): string {
  return [
    describeItems(p.take, profile.products),
    p.takeDrinkDoses > 0 && n.drink ? plural(p.takeDrinkDoses, `dose de ${n.drink.name}`, `doses de ${n.drink.name}`) : '',
  ].filter(Boolean).join(', ');
}

/** La consigne d'un tronçon : "1 gel toutes les 40 min", "1 Compote Baouw vers 14h10"… */
export function describeRhythm(leg: LegNutrition, n: NutritionPlan, plan: RacePlan): string {
  const count = leg.sequence.length;
  if (count === 0) return leg.aidCarbsG > 0 ? 'Rien à manger : le ravito et la boisson suffisent' : 'Rien à manger : la boisson suffit';
  const byId = new Map(n.foods.map((p) => [p.id, p]));
  if (count === 1) {
    const arrival = plan.checkpoints[leg.index]?.arrival;
    const at = arrival ? ` vers ${formatClockFromMinutes(localMinutes(arrival) - leg.minutes / 2).replace(/^\S+ /, '')}` : '';
    return `1 ${byId.get(leg.sequence[0])?.name ?? 'produit'}${at}`;
  }
  const kinds = new Set(leg.sequence.map((id) => byId.get(id)?.kind));
  const word = kinds.size > 1 ? 'produit' : kinds.has('GEL') ? 'gel' : 'solide';
  const every = Math.max(10, Math.round(leg.minutes / count / 5) * 5);
  return `1 ${word} toutes les ${every} min`;
}

/** Ce qu'il faut faire à un point : remplir ses flasques, manger, récupérer la suite (une ligne, pour le PDF). */
export function describeActions(p: PointActions, n: NutritionPlan, profile: NutritionProfile, start: boolean): string {
  const parts: string[] = [];
  if (p.fillFlasks > 0) parts.push(describeFill(p.fillFlasks, p.fillDrinkFlasks, n, start ? 'Partir avec' : 'Remplir'));
  if (p.eatG > 0) parts.push(p.eatG >= MEAL_CARBS_G ? `repas chaud (≈ ${p.eatG} g)` : `manger au ravito (≈ ${p.eatG} g)`);
  const take = describeTake(p, n, profile);
  if (take) parts.push(`${start ? 'emporter' : p.crew ? 'assistance' : 'sac'} : ${take}`);
  return parts.join(' · ');
}

/** Bilan de la course : "853 g de glucides, 5,8 L d'eau → 12 Gel Décathlon, 6 Compote Baouw, 14 doses de Meltonic". */
export function describeTotals(n: NutritionPlan, profile: NutritionProfile): string {
  const products = [
    describeItems(n.totals.items, profile.products),
    n.drink && n.totals.drinkDoses > 0 ? `${n.totals.drinkDoses} doses de ${n.drink.name}` : '',
  ].filter(Boolean).join(', ') || 'aucun produit';
  return `${Math.round(n.totals.carbsG)} g de glucides, ${liters(n.totals.waterMl)} d'eau → ${products}`;
}
