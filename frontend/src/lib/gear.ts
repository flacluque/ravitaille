import type { ExtractedGear, RacePlan } from '../api/types';
import { durationMinutes } from './format';
import type { NutritionProfile } from './nutrition';

export type GearStatus = 'MANDATORY' | 'RECOMMENDED' | 'PERSONAL';

export interface GearItem {
  id: string;
  name: string;
  status: GearStatus;
  /** Prêt / dans le sac. */
  packed: boolean;
}

export const GEAR_STATUS_LABEL: Record<GearStatus, string> = {
  MANDATORY: 'Obligatoire',
  RECOMMENDED: 'Recommandé',
  PERSONAL: 'Perso',
};

let nextId = 0;
export function gearId(): string {
  nextId += 1;
  return `g-${Date.now().toString(36)}-${nextId}`;
}

/** Liste type d'un trail long (à adapter au règlement de la course). */
export const TEMPLATE: string[] = [
  'Lampe frontale + piles ou batterie de rechange',
  'Couverture de survie',
  'Sifflet',
  "Réserve d'eau",
  'Réserve alimentaire',
  'Veste imperméable avec capuche',
  'Couche chaude à manches longues',
  'Téléphone portable chargé',
  'Gobelet personnel',
  'Bande élastique adhésive',
  'Casquette ou tour de cou',
  'Gants',
  "Pièce d'identité",
  'Lumière rouge clignotante arrière',
];

export function templateItems(): GearItem[] {
  return TEMPLATE.map((name) => ({ id: gearId(), name, status: 'RECOMMENDED', packed: false }));
}

/**
 * Lecture du règlement → checklist. Les éléments perso déjà saisis sont gardés, ainsi que la case
 * « prêt » d'un élément qui figurait déjà dans la liste.
 */
export function mergeExtracted(current: GearItem[], extracted: ExtractedGear): GearItem[] {
  const packed = new Set(current.filter((i) => i.packed).map((i) => plain(i.name)));
  const fromRules: GearItem[] = extracted.items.map((i) => ({
    id: gearId(), name: i.name, status: i.status, packed: packed.has(plain(i.name)),
  }));
  return [...fromRules, ...current.filter((i) => i.status === 'PERSONAL')];
}

export function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Suggestions tirées du plan, pour ce qui manque à la liste. */
export function suggestions(items: GearItem[], plan: RacePlan | undefined): string[] {
  if (!plan) return [];
  const names = items.map((i) => plain(i.name));
  const has = (re: RegExp) => names.some((n) => re.test(n));
  const out: string[] = [];
  const night = durationMinutes(plan.nightDuration);
  if (night > 0 && !has(/frontale|lampe/)) {
    out.push('Lampe frontale + piles ou batterie de rechange (ton plan passe de nuit)');
  }
  if (night > 0 && !has(/couche|polaire|manches longues|doudoune/)) {
    out.push('Couche chaude pour la nuit');
  }
  if (night > 0 && !has(/rouge|clignotant/)) {
    out.push('Lumière rouge clignotante arrière (souvent exigée de nuit)');
  }
  return out;
}

/** "1,5 l d'eau" → 1,5 : eau minimale imposée par le règlement, en litres (null si non trouvée). */
export function requiredWaterLiters(items: GearItem[]): number | null {
  for (const item of items) {
    if (item.status !== 'MANDATORY') continue;
    const m = /(\d+(?:[.,]\d+)?)\s*(?:l|litres?)\b[^,;]*\beau\b/i.exec(item.name)
      ?? /\beau\b[^,;]*?(\d+(?:[.,]\d+)?)\s*(?:l|litres?)\b/i.exec(item.name);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return null;
}

/** Eau imposée par le règlement comparée aux flasques du profil nutrition. */
export function waterCheck(items: GearItem[], profile: NutritionProfile): { ok: boolean; message: string } | null {
  const required = requiredWaterLiters(items);
  if (required === null) return null;
  const capacity = (profile.flasks * profile.flaskMl) / 1000;
  const fmt = (l: number) => `${l.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;
  const flasks = `${profile.flasks} flasque${profile.flasks > 1 ? 's' : ''} de ${profile.flaskMl} ml`;
  return capacity + 1e-9 >= required
    ? { ok: true, message: `${fmt(required)} d'eau obligatoires : tes ${flasks} font ${fmt(capacity)}.` }
    : { ok: false, message: `${fmt(required)} d'eau obligatoires, mais tes ${flasks} ne font que ${fmt(capacity)} : `
        + 'ajoute une flasque ou une poche à eau.' };
}
