import type { CourseView, RacePlan, Service } from '../api/types';
import { siteUrl } from '../api/platform';
import { buildShare, encodeShare } from './crew';
import { formatClock } from './format';
import { computeNutrition, describeFill, describeTake, type NutritionProfile } from './nutrition';
import type { Fix } from './race';

/** Ce que l'assistance prépare à un point : flasques remplies, puis chaque produit et dose. */
export function crewPrepare(plan: RacePlan, services: Service[][], profile: NutritionProfile, crew: string[]) {
  const n = computeNutrition(plan, services, profile, crew);
  return (index: number): string[] => {
    const p = n.points[index];
    if (!p) return [];
    const items: string[] = [];
    if (p.fillFlasks > 0) items.push(`${describeFill(p.fillFlasks, p.fillDrinkFlasks, n, '').trim()} remplies`);
    const take = describeTake(p, n, profile);
    if (take) items.push(...take.split(', '));
    return items;
  };
}

export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Envoie le lien de l'assistance : feuille de partage du téléphone (WhatsApp, mail…), sinon copie
 * dans le presse-papier. Le plan voyage dans le lien.
 */
export async function shareWithCrew(args: {
  plans: RacePlan[]; likely: number; course: CourseView; services: Service[][]; profile: NutritionProfile;
  crew: string[]; fix: Fix | null; runner: string | null; update?: string;
}): Promise<ShareResult> {
  const base = args.plans[args.likely] ?? args.plans[0];
  const share = buildShare(args.plans, args.likely, args.course, args.crew,
    crewPrepare(base, args.services, args.profile, args.crew), args.fix, args.runner);
  const url = `${siteUrl()}/${await encodeShare(share)}`;
  const places = share.crew.map((i) => share.points[i].name);
  const text = args.update
    ?? `Suis-moi sur ${share.race} (départ ${formatClock(share.start)}) : heures de passage${places.length ? `, rendez-vous à ${places.join(' et ')}` : ''}, et ce qu'il faut me préparer.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: `Assistance · ${share.race}`, text, url });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
