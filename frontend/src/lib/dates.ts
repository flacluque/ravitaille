/** Dates du calendrier au format ISO "2026-10-23", calculées en UTC pour ignorer les fuseaux et l'heure d'été. */

const DAY = 86_400_000;

const parse = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parse(value)) && format(parse(value)) === value;
}

export function addDays(iso: string, days: number): string {
  return format(parse(iso) + days * DAY);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / DAY);
}

/** Aujourd'hui, dans le fuseau du navigateur. */
export function todayIso(now = new Date()): string {
  return format(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Lundi = 0 … dimanche = 6. */
export function weekday(iso: string): number {
  return (new Date(parse(iso)).getUTCDay() + 6) % 7;
}

/** Les jours affichés pour un mois : semaines complètes du lundi au dimanche. */
export function monthGrid(year: number, month: number): string[] {
  const first = format(Date.UTC(year, month, 1));
  const start = addDays(first, -weekday(first));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((weekday(first) + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

const LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const FULL = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** « ven. 23 oct. 2026 » */
export function formatDay(iso: string): string {
  return LONG.format(parse(iso));
}

/** « vendredi 23 octobre 2026 », pour les lecteurs d'écran. */
export function formatDayLong(iso: string): string {
  return FULL.format(parse(iso));
}

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
  'novembre', 'décembre'];

/**
 * Bloc de préparation d'une course, comme le calcule l'API (TrainingHistory.blockBefore) : les
 * {@code weeks} semaines qui précèdent la semaine de course. Pour une course à venir, seule la partie
 * déjà courue compte (jusqu'à aujourd'hui inclus).
 *
 * @return start inclus, end exclu, raceWeek début de la semaine de course, elapsedWeeks semaines déjà faites
 */
export function prepWindow(raceDate: string, weeks: number, today = todayIso()) {
  const raceWeek = addDays(raceDate, -7);
  const start = addDays(raceWeek, -7 * weeks);
  const tomorrow = addDays(today, 1);
  const end = raceWeek < tomorrow ? raceWeek : tomorrow;
  const elapsedWeeks = Math.min(weeks, Math.max(0, daysBetween(start, end) / 7));
  return { start, end, raceWeek, elapsedWeeks };
}
