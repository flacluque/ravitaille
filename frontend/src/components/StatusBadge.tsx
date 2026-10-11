import type { ReactNode } from 'react';
import type { CutoffStatus } from '../api/types';

const LABELS: Record<CutoffStatus, string> = {
  NONE: '',
  OK: 'Marge confortable',
  TIGHT: "Moins d'1 h de marge",
  MISSED: 'Barrière dépassée',
};

export function StatusBadge({ status, children }: { status: CutoffStatus; children: ReactNode }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`} title={LABELS[status]}>
      {status === 'TIGHT' && '⚠ '}
      {status === 'MISSED' && '✕ '}
      {children}
    </span>
  );
}
