import type { RacePlan } from '../api/types';
import { formatClock, formatDuration } from '../lib/format';
import { tightestCutoff } from '../lib/plan';
import { StatusBadge } from './StatusBadge';

interface Props {
  plans: RacePlan[];
  selected: number;
  onSelect: (index: number) => void;
}

/** L'essentiel en un coup d'œil : l'arrivée prévue, la fourchette des scénarios et la barrière la plus serrée. */
export function PlanHero({ plans, selected, onSelect }: Props) {
  const plan = plans[Math.min(selected, plans.length - 1)];
  if (!plan) return null;
  const tightest = tightestCutoff(plan);
  const first = plans[0];
  const last = plans[plans.length - 1];
  // Le hero change de teinte quand la marge la plus serrée passe sous 1 h, ou qu'une barrière saute.
  const alert = tightest?.eta.status === 'MISSED' ? 'missed' : tightest?.eta.status === 'TIGHT' ? 'tight' : '';
  return (
    <section className={`plan-hero ${alert}`} aria-label="Arrivée prévue">
      <div className="plan-hero-main">
        <span className="plan-hero-label">Arrivée prévue · scénario {plan.scenario.name.toLowerCase()}</span>
        <span className="plan-hero-finish scenario-finish">{formatClock(plan.finish)}</span>
        <span className="plan-hero-detail">
          {formatDuration(plan.totalDuration)} de course
          {plans.length > 1 && <> · fourchette {formatClock(first.finish).replace(/^\S+ /, '')} – {formatClock(last.finish).replace(/^\S+ /, '')}</>}
        </span>
      </div>
      <div className="plan-hero-side">
        {plans.length > 1 && (
          <div className="plan-hero-scenarios" role="group" aria-label="Scénario">
            {plans.map((p, i) => (
              <button key={p.scenario.name} type="button" aria-pressed={i === selected}
                className={i === selected ? 'active' : ''} onClick={() => onSelect(i)}>
                {p.scenario.name}
              </button>
            ))}
          </div>
        )}
        {tightest && (
          <span className="plan-hero-tight">
            Barrière la plus serrée : <strong>{tightest.eta.name}</strong>{' '}
            <StatusBadge status={tightest.eta.status} minutes={tightest.cutoff.marginMinutes} />
          </span>
        )}
      </div>
    </section>
  );
}
