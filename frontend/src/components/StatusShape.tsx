import type { CutoffStatus } from '../api/types';
import { statusShapePaint, statusShapePath } from '../lib/markerShape';

/** Petite forme de statut (légende, textes) : la même que sur la carte et le profil. */
export function StatusShape({ status, size = 12 }: { status: CutoffStatus; size?: number }) {
  const r = size / 3.2;
  const c = size / 2;
  const { fill, stroke } = statusShapePaint(status);
  return (
    <svg className="status-shape" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={statusShapePath(status, c, c, r)} fill={fill} stroke={status === 'NONE' ? stroke : 'none'} strokeWidth={1.6}
        strokeLinejoin="round" />
    </svg>
  );
}
