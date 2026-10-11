// Durées ISO-8601 (java.time.Duration) et dates locales (java.time.LocalDateTime) → texte.

const DURATION = /^(-)?P(?:(-?\d+(?:\.\d+)?)D)?(?:T(?:(-?\d+(?:\.\d+)?)H)?(?:(-?\d+(?:\.\d+)?)M)?(?:(-?\d+(?:\.\d+)?)S)?)?$/;

/** "PT14H12M2S" → 852.03 ; "PT-1H-30M" → -90. Java met le signe sur chaque composante. */
export function durationMinutes(iso: string): number {
  const m = DURATION.exec(iso);
  if (!m) throw new Error(`Durée ISO invalide : ${iso}`);
  const [, neg, d, h, min, s] = m;
  const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(s ?? 0) / 60;
  return neg ? -total : total;
}

/** 852 → "14h12" ; -42 → "-0h42". Arrondi à la minute. */
export function formatHm(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const total = Math.round(Math.abs(minutes));
  return `${sign}${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}

export function formatDuration(iso: string): string {
  return formatHm(durationMinutes(iso));
}

/** Saisie libre "8h48", "8:48", "8h", "528" (minutes) → "PT8H48M". null si illisible. */
export function parseHmInput(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  let m = /^(\d{1,3})(?:h|:)(\d{1,2})?(?:min|m)?$/.exec(t);
  if (m) {
    const min = Number(m[2] ?? 0);
    if (min >= 60) return null;
    const total = Number(m[1]) * 60 + min;
    return total > 0 ? `PT${Math.floor(total / 60)}H${total % 60}M` : null;
  }
  m = /^(\d{1,4})$/.exec(t);
  if (m && Number(m[1]) > 0) {
    const total = Number(m[1]);
    return `PT${Math.floor(total / 60)}H${total % 60}M`;
  }
  return null;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Lecture sans passer par le fuseau du navigateur : l'heure du roadbook est l'heure locale de la course. */
function parts(iso: string): LocalParts {
  const m = LOCAL_DATE_TIME.exec(iso);
  if (!m) throw new Error(`Date invalide : ${iso}`);
  return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
}

/** Minutes depuis l'époque, en "temps local de course" (pas de fuseau, pas d'heure d'été). */
export function localMinutes(iso: string): number {
  const p = parts(iso);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60000;
}

/** Inverse de localMinutes, arrondi à la minute → "ven 13h31". */
export function formatClockFromMinutes(minutes: number): string {
  const d = new Date(Math.round(minutes) * 60000);
  return `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "2026-10-23T13:31:02.5" → "ven 13h31". */
export function formatClock(iso: string): string {
  return formatClockFromMinutes(localMinutes(iso));
}

/** Allure en min/km décimales → "8'12/km". */
export function formatPace(minPerKm: number): string {
  const total = Math.round(minPerKm * 60);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}/km`;
}

export function formatKm(km: number): string {
  return km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatMeters(m: number): string {
  return `${Math.round(m).toLocaleString('fr-FR')} m`;
}
