import type { RacePlan, Service } from '../api/types';
import { durationMinutes } from './format';

/**
 * Plan de nutrition et d'hydratation, tronçon par tronçon, à partir du plan de course.
 *
 * - Besoins d'un tronçon : durée × objectif horaire (glucides) ; eau selon la part de jour et de nuit.
 * - Eau : on remplit ses flasques à chaque point d'eau, pour tenir jusqu'au suivant. Une partie des
 *   flasques contient la boisson énergétique, dont les glucides sont décomptés.
 * - Glucides restants : gels, compotes, barres... dans la proportion choisie. On porte depuis le départ
 *   ce qu'il faut jusqu'au prochain point de réapprovisionnement (sac de délestage, assistance).
 *   Le solide des ravitos n'est pas compté : c'est un bonus, pas un plan.
 *
 * Repères par défaut courants en ultra, à ajuster par chacun : ce ne sont pas des conseils médicaux.
 */

export type ProductKind = 'GEL' | 'COMPOTE' | 'BAR' | 'DRINK' | 'OTHER';

export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  /** Glucides par unité ; pour une boisson, par flasque remplie. */
  carbsG: number;
  /** Part relative parmi les solides (2 gels pour 1 compote : 2 et 1). Ignoré pour une boisson. */
  share: number;
}

export interface NutritionProfile {
  carbsPerHour: number;
  waterDayMlPerHour: number;
  waterNightMlPerHour: number;
  flasks: number;
  flaskMl: number;
  /** Flasques remplies de boisson énergétique à chaque remplissage (les autres : eau). */
  drinkFlasks: number;
  /** Une assistance personnelle peut réapprovisionner aux points où elle est autorisée. */
  hasCrew: boolean;
  products: Product[];
}

export const DEFAULT_PROFILE: NutritionProfile = {
  carbsPerHour: 70,
  waterDayMlPerHour: 500,
  waterNightMlPerHour: 400,
  flasks: 3,
  flaskMl: 500,
  drinkFlasks: 1,
  hasCrew: false,
  products: [
    { id: 'gel', name: 'Gel Décathlon', kind: 'GEL', carbsG: 40, share: 2 },
    { id: 'compote', name: 'Compote Baouw', kind: 'COMPOTE', carbsG: 30, share: 1 },
    { id: 'meltonic', name: 'Meltonic', kind: 'DRINK', carbsG: 30, share: 0 },
  ],
};

export type Items = Record<string, number>;

export interface LegNutrition {
  /** Indice du point d'arrivée du tronçon dans le plan. */
  index: number;
  minutes: number;
  nightMinutes: number;
  carbsG: number;
  waterMl: number;
  /** Boisson énergétique bue sur le tronçon (ml) et ses glucides. */
  drinkMl: number;
  drinkCarbsG: number;
  /** Solides à consommer sur le tronçon. */
  items: Items;
  itemsCarbsG: number;
}

/** Ce qu'il faut faire à un point (départ compris). */
export interface PointActions {
  index: number;
  /** Flasques à remplir ici pour tenir jusqu'au prochain point d'eau (0 si pas de point d'eau). */
  fillFlasks: number;
  fillDrinkFlasks: number;
  /** Solides et doses de boisson à prendre ici (départ, sac de délestage, assistance). */
  restock: Items;
  restockDrinkDoses: number;
}

export interface NutritionPlan {
  legs: LegNutrition[];
  points: PointActions[];
  totals: { carbsG: number; waterMl: number; items: Items; drinkDoses: number };
  alerts: string[];
  drink: Product | null;
}

/**
 * @param services services de chaque point du plan (même ordre que plan.checkpoints)
 */
export function computeNutrition(plan: RacePlan, services: Service[][], profile: NutritionProfile): NutritionPlan {
  const etas = plan.checkpoints;
  const last = etas.length - 1;
  const drink = profile.drinkFlasks > 0 ? profile.products.find((p) => p.kind === 'DRINK' && p.carbsG >= 0) ?? null : null;
  const solids = profile.products.filter((p) => p.kind !== 'DRINK' && p.carbsG > 0 && p.share > 0);
  const alerts: string[] = [];
  const has = (i: number, s: Service) => (services[i] ?? []).includes(s);
  const canRefill = (i: number) => i === 0 || (i < last && (has(i, 'WATER') || has(i, 'DRINKS')));
  const canRestock = (i: number) => i === 0 || (i < last && (has(i, 'DROP_BAG') || (profile.hasCrew && has(i, 'ASSISTANCE'))));

  // --- Besoins bruts par tronçon ---
  const legs: LegNutrition[] = [];
  for (let i = 1; i <= last; i++) {
    const minutes = Math.max(0, durationMinutes(etas[i].legDuration));
    const night = Math.min(minutes, Math.max(0, durationMinutes(etas[i].legNightDuration ?? 'PT0S')));
    legs.push({
      index: i,
      minutes,
      nightMinutes: night,
      carbsG: (profile.carbsPerHour * minutes) / 60,
      waterMl: (profile.waterDayMlPerHour * (minutes - night) + profile.waterNightMlPerHour * night) / 60,
      drinkMl: 0,
      drinkCarbsG: 0,
      items: {},
      itemsCarbsG: 0,
    });
  }

  // --- Eau : d'un point d'eau au suivant ---
  const points: PointActions[] = etas.map((_, i) => ({ index: i, fillFlasks: 0, fillDrinkFlasks: 0, restock: {}, restockDrinkDoses: 0 }));
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
    for (const leg of segment) {
      leg.drinkMl = Math.min(leg.waterMl * drinkShare, drinkFlasks * profile.flaskMl);
      leg.drinkCarbsG = drink ? (leg.drinkMl / profile.flaskMl) * drink.carbsG : 0;
    }
    from = to;
  }

  // --- Solides : complètent la boisson, au fil des tronçons (le reste d'un tronçon passe au suivant) ---
  const counts: Items = Object.fromEntries(solids.map((p) => [p.id, 0]));
  let deficit = 0;
  const minCarbs = solids.length ? Math.min(...solids.map((p) => p.carbsG)) : 0;
  for (const leg of legs) {
    const need = Math.max(0, leg.carbsG - leg.drinkCarbsG) + deficit;
    let covered = 0;
    while (solids.length && covered < need - minCarbs / 2) {
      // Le produit le plus « en retard » sur sa part : les proportions restent justes sur la course.
      // À égalité, celui qui est le moins représenté jusqu'ici (sinon le premier gagnerait toujours).
      const next = (q: Product) => (counts[q.id] + 1) / q.share;
      const now = (q: Product) => counts[q.id] / q.share;
      const p = solids.reduce((best, q) =>
        next(q) < next(best) || (next(q) === next(best) && now(q) < now(best)) ? q : best);
      counts[p.id] += 1;
      leg.items[p.id] = (leg.items[p.id] ?? 0) + 1;
      covered += p.carbsG;
    }
    leg.itemsCarbsG = covered;
    deficit = need - covered;
  }

  // --- Réapprovisionnement : on porte jusqu'au prochain sac de délestage / assistance ---
  for (let from = 0; from < last; ) {
    let to = from + 1;
    while (to < last && !canRestock(to)) to++;
    const restock: Items = {};
    for (const leg of legs.slice(from, to)) {
      for (const [id, n] of Object.entries(leg.items)) restock[id] = (restock[id] ?? 0) + n;
    }
    points[from].restock = restock;
    // Doses de boisson pour les remplissages faits avant le prochain réapprovisionnement (au départ, on
    // prépare ses flasques à l'avance : pas de dose à porter).
    let doses = 0;
    for (let i = from; i < to; i++) {
      if (i > 0) doses += points[i].fillDrinkFlasks;
    }
    points[from].restockDrinkDoses = doses;
    from = to;
  }

  const total = (pick: (l: LegNutrition) => number) => legs.reduce((s, l) => s + pick(l), 0);
  return {
    legs,
    points,
    totals: {
      carbsG: total((l) => l.carbsG),
      waterMl: total((l) => l.waterMl),
      items: counts,
      drinkDoses: points.reduce((s, p) => s + p.fillDrinkFlasks, 0),
    },
    alerts,
    drink,
  };
}

function pointName(plan: RacePlan, i: number): string {
  return plan.checkpoints[i]?.name ?? `point ${i + 1}`;
}

export function liters(ml: number): string {
  return `${(ml / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
}

/** { gel: 2, compote: 1 } → "2 Gel Décathlon, 1 Compote Baouw" (dans l'ordre du profil). */
export function describeItems(items: Items, products: Product[]): string {
  return products
    .filter((p) => (items[p.id] ?? 0) > 0)
    .map((p) => `${items[p.id]} ${p.name}`)
    .join(', ');
}

/** Ce qu'il faut consommer sur un tronçon : "2 Gel Décathlon, 1 Compote Baouw + 500 ml Meltonic". */
export function describeConsumption(leg: LegNutrition, n: NutritionPlan, profile: NutritionProfile): string {
  return [
    describeItems(leg.items, profile.products),
    leg.drinkMl >= 50 && n.drink ? `${Math.round(leg.drinkMl / 50) * 50} ml ${n.drink.name}` : '',
  ].filter(Boolean).join(' + ');
}

/** Ce qu'il faut faire à un point : "Remplir : 3 flasques (dont 1 de Meltonic) · Récupérer : 4 Gel Décathlon". */
export function describeActions(p: PointActions, n: NutritionPlan, profile: NutritionProfile, start: boolean): string {
  const parts: string[] = [];
  if (p.fillFlasks > 0) {
    const flasks = `${p.fillFlasks} flasque${p.fillFlasks > 1 ? 's' : ''}`;
    const drink = p.fillDrinkFlasks > 0 && n.drink ? ` (dont ${p.fillDrinkFlasks} de ${n.drink.name})` : '';
    parts.push(`${start ? 'Flasques pleines' : 'Remplir'} : ${flasks}${drink}`);
  }
  const take = [
    describeItems(p.restock, profile.products),
    p.restockDrinkDoses > 0 && n.drink ? `${p.restockDrinkDoses} dose${p.restockDrinkDoses > 1 ? 's' : ''} de ${n.drink.name}` : '',
  ].filter(Boolean).join(', ');
  if (take) parts.push(`${start ? 'Emporter' : 'Récupérer'} : ${take}`);
  return parts.join(' · ');
}

/** Bilan de la course : "853 g de glucides, 5,8 L d'eau : 12 Gel Décathlon, 6 Compote Baouw, 7 doses de Meltonic". */
export function describeTotals(n: NutritionPlan, profile: NutritionProfile): string {
  const products = [
    describeItems(n.totals.items, profile.products),
    n.drink && n.totals.drinkDoses > 0 ? `${n.totals.drinkDoses} doses de ${n.drink.name}` : '',
  ].filter(Boolean).join(', ') || 'aucun produit';
  return `${Math.round(n.totals.carbsG)} g de glucides, ${liters(n.totals.waterMl)} d'eau → ${products}`;
}
