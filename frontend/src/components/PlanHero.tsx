import type { RacePlan } from '../api/types';
import { formatClock, formatDuration } from '../lib/format';
import { tightestCutoff, worstCutoff } from '../lib/plan';
import { StatusBadge } from './StatusBadge';

interface Props {
  plans: RacePlan[];
  selected: number;
  onSelect: (index: number) => void;
}

/** Ce que veut dire chaque scénario, dans l'ordre optimiste, réaliste, prudent. */
const SCENARIO_HELP = [
  'Optimiste : un jour où tout roule, arrêts courts.',
  'Réaliste : ta forme habituelle, d\'après tes références.',
  'Prudent : jour sans, chaleur ou terrain gras, arrêts plus longs.',
];

/** L'essentiel en un coup d'œil : l'arrivée prévue, la fourchette des scénarios et la barrière la plus serrée. */
export function PlanHero({ plans, selected, onSelect }: Props) {
  const plan = plans[Math.min(selected, plans.length - 1)];
  if (!plan) return null;
  const tightest = tightestCutoff(plan);
  const first = plans[0];
  const last = plans[plans.length - 1];
  // Le pire cas, tous scénarios confondus : on le montre dès qu'il est plus serré que le scénario affiché.
  const worst = worstCutoff(plans);
  const showWorst = worst && tightest && worst.scenario !== selected
    && worst.cutoff.marginMinutes < tightest.cutoff.marginMinutes;
  // Le jour n'est répété dans la fourchette que s'il change d'une borne à l'autre.
  const sameDay = formatClock(first.finish).split(' ')[0] === formatClock(last.finish).split(' ')[0];
  const bound = (iso: string) => (sameDay ? formatClock(iso).replace(/^\S+ /, '') : formatClock(iso));
  // Le hero change de teinte quand la marge la plus serrée passe sous 1 h, ou qu'une barrière saute.
  const alert = tightest?.eta.status === 'MISSED' ? 'missed' : tightest?.eta.status === 'TIGHT' ? 'tight' : '';
  return (
    <section className={`plan-hero ${alert}`} aria-label="Arrivée prévue">
      <div className="plan-hero-main">
        <span className="plan-hero-label">Arrivée prévue · scénario {plan.scenario.name.toLowerCase()}</span>
        <span className="plan-hero-finish scenario-finish">{formatClock(plan.finish)}</span>
        <span className="plan-hero-detail">
          {formatDuration(plan.totalDuration)} de course
          {plans.length > 1 && <> · entre {bound(first.finish)} et {bound(last.finish)} selon ta journée</>}
        </span>
      </div>
      <div className="plan-hero-side">
        {plans.length > 1 && (
          <div className="plan-hero-scenarios" role="group" aria-label="Scénario">
            {plans.map((p, i) => (
              <button key={p.scenario.name} type="button" aria-pressed={i === selected}
                className={i === selected ? 'active' : ''} onClick={() => onSelect(i)} title={SCENARIO_HELP[i] ?? undefined}>
                {p.scenario.name}
              </button>
            ))}
          </div>
        )}
        {plans.length === 3 && <span className="plan-hero-help">{SCENARIO_HELP[selected]}</span>}
        {tightest && (
          <span className="plan-hero-tight">
            Barrière la plus serrée : <strong>{tightest.eta.name}</strong>{' '}
            <StatusBadge status={tightest.eta.status} minutes={tightest.cutoff.marginMinutes} />
          </span>
        )}
        {showWorst && (
          <button type="button" className="plan-hero-worst" onClick={() => onSelect(worst.scenario)}>
            <span>Au pire ({plans[worst.scenario].scenario.name.toLowerCase()}) : <strong>{worst.eta.name}</strong></span>
            <StatusBadge status={worst.eta.status} minutes={worst.cutoff.marginMinutes} />
          </button>
        )}
      </div>
    </section>
  );
}
