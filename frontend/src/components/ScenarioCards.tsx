import type { RacePlan } from '../api/types';
import { formatClock, formatDuration } from '../lib/format';
import { tightestCutoff } from '../lib/plan';
import { StatusBadge } from './StatusBadge';

interface Props {
  plans: RacePlan[];
  selected: number;
  onSelect: (index: number) => void;
}

export function ScenarioCards({ plans, selected, onSelect }: Props) {
  return (
    <div className="scenarios" role="tablist" aria-label="Scénarios">
      {plans.map((plan, i) => {
        const tightest = tightestCutoff(plan);
        return (
          <button
            key={plan.scenario.name}
            type="button"
            role="tab"
            aria-selected={i === selected}
            className={`scenario ${i === selected ? 'selected' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className="scenario-name">{plan.scenario.name}</span>
            <span className="scenario-finish">{formatClock(plan.finish)}</span>
            <span className="scenario-detail">
              {formatDuration(plan.totalDuration)} · arrêts {formatDuration(plan.totalStops)}
            </span>
            {tightest && (
              <span className="scenario-detail">
                Barrière la plus serrée : {tightest.eta.name}{' '}
                <StatusBadge status={tightest.eta.status} minutes={tightest.cutoff.marginMinutes} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
