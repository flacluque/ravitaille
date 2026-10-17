import type { CutoffStatus } from '../api/types';
import { formatHm } from '../lib/format';
import { StatusShape } from './StatusShape';

/** Marge sur une barrière, écrite en toutes lettres (lisible sans la couleur) avec la forme de son statut. */
export function statusText(status: CutoffStatus, minutes: number): string {
  switch (status) {
    case 'MISSED': return `dépassée de ${formatHm(Math.abs(minutes))}`;
    case 'TIGHT': return `serré : ${formatHm(minutes)} de marge`;
    default: return `${formatHm(minutes)} de marge`;
  }
}

export function StatusBadge({ status, minutes }: { status: CutoffStatus; minutes: number }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      {status !== 'OK' && status !== 'NONE' && <StatusShape status={status} size={11} />}
      {statusText(status, minutes)}
    </span>
  );
}
