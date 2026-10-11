import type { AidLevel, Service } from '../api/types';

/** Ordre d'affichage, le même que l'enum Java. */
export const SERVICES: Service[] = ['WATER', 'DRINKS', 'COLD_FOOD', 'HOT_FOOD', 'DROP_BAG', 'ASSISTANCE'];

export const SERVICE_INFO: Record<Service, { icon: string; label: string; short: string }> = {
  WATER: { icon: '💧', label: 'Eau', short: 'eau' },
  DRINKS: { icon: '🥤', label: 'Boissons (sucrées, chaudes…)', short: 'boissons' },
  COLD_FOOD: { icon: '🍌', label: 'Solide froid', short: 'solide' },
  HOT_FOOD: { icon: '🍲', label: 'Solide chaud / repas', short: 'chaud' },
  DROP_BAG: { icon: '🎒', label: 'Sac de délestage', short: 'sac' },
  ASSISTANCE: { icon: '🤝', label: 'Assistance autorisée', short: 'assistance' },
};

/** Services implicites d'un type d'arrêt (anciens roadbooks), comme Service.defaultsFor côté Java. */
export function defaultServices(aid: AidLevel): Service[] {
  switch (aid) {
    case 'NONE': return [];
    case 'LIGHT': return ['WATER', 'DRINKS', 'COLD_FOOD'];
    case 'FULL': return ['WATER', 'DRINKS', 'COLD_FOOD', 'HOT_FOOD'];
  }
}

/** Type d'arrêt déduit des services, comme Service.aidFor côté Java. */
export function aidFor(services: Service[]): AidLevel {
  if (services.includes('HOT_FOOD') || services.includes('DROP_BAG')) return 'FULL';
  if (services.includes('WATER') || services.includes('DRINKS') || services.includes('COLD_FOOD')) return 'LIGHT';
  return 'NONE';
}

/** Services triés dans l'ordre d'affichage, sans doublon. */
export function sortServices(services: Service[]): Service[] {
  return SERVICES.filter((s) => services.includes(s));
}
