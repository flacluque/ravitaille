import type { CourseView, RacePlan, RaceReview } from '../api/types';
import { localMinutes } from './format';

/** Un point du roadbook : heure prévue par le plan et heure réelle, en minutes depuis le départ. */
export interface ReviewRow {
  name: string;
  km: number;
  planned: number;
  actual: number | null;
}

/** Minutes écoulées au km `km` de l'activité (interpolées tous les 100 m), null au-delà. */
export function elapsedAt(review: RaceReview, km: number): number | null {
  const pts = review.points;
  if (pts.length === 0 || km > pts[pts.length - 1][0] + 0.05) return null;
  if (km <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [k1, t1] = pts[i];
    if (km <= k1) {
      const [k0, t0] = pts[i - 1];
      return k1 > k0 ? t0 + ((km - k0) / (k1 - k0)) * (t1 - t0) : t1;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Plan et course réelle, point par point. La position de chaque point sur la trace (ou son km au roadbook) est
 * ramenée à la distance de la montre : une montre compte rarement exactement la longueur de la trace.
 */
export function compareRace(plan: RacePlan, course: CourseView, review: RaceReview): ReviewRow[] {
  const start = localMinutes(plan.start);
  const trackKm = course.track?.distanceKm ?? null;
  const last = plan.checkpoints.length - 1;
  return plan.checkpoints.map((eta, i) => {
    const marker = course.markers[i];
    const share = marker && trackKm ? marker.trackKm / trackKm : plan.totalDistanceKm > 0 ? eta.km / plan.totalDistanceKm : 0;
    const actual = i === 0 ? 0 : i === last ? review.elapsedMinutes : elapsedAt(review, share * review.distanceKm);
    return { name: eta.name, km: eta.km, planned: localMinutes(eta.arrival) - start, actual };
  });
}
