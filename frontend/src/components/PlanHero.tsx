import type { RacePlan } from '../api/types';
import { formatClock, formatDuration, localMinutes } from '../lib/format';
import { bindingCutoff, tightestCutoff, worstCutoff } from '../lib/plan';
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
  // Frise du départ à la barrière d'arrivée : où tombe la fourchette des scénarios, et le scénario affiché.
  const startMin = localMinutes(plan.start);
  const finishCut = bindingCutoff(plan.checkpoints[plan.checkpoints.length - 1]);
  const lastFinish = localMinutes(last.finish);
  const endMin = finishCut ? Math.max(localMinutes(finishCut.at), lastFinish) : lastFinish + (lastFinish - startMin) * 0.1;
  const pos = (iso: string) => `${(((localMinutes(iso) - startMin) / Math.max(1, endMin - startMin)) * 100).toFixed(1)}%`;
  const [day, time] = splitClock(formatClock(plan.finish));
  return (
    <section className="plan-hero" aria-label="Arrivée prévue">
      <div className="plan-hero-main">
        <span className="plan-hero-label">Arrivée prévue · scénario {plan.scenario.name.toLowerCase()}</span>
        <span className="plan-hero-finish scenario-finish"><span className="plan-hero-day">{day}</span> {time}</span>
        <span className="plan-hero-detail">
          {formatDuration(plan.totalDuration)} de course
          {plans.length > 1 && <> · entre <strong>{bound(first.finish)}</strong> et <strong>{bound(last.finish)}</strong> selon ta journée</>}
        </span>
        <div className="plan-hero-frieze" aria-hidden>
          <span className="frieze-line" />
          {plans.length > 1 && (
            <span className="frieze-band" style={{ left: pos(first.finish), right: `calc(100% - ${pos(last.finish)})` }} />
          )}
          <span className="frieze-dot" style={{ left: pos(plan.finish) }} />
          {finishCut && <span className="frieze-cut" />}
          <span className="frieze-start">Départ {formatClock(plan.start)}</span>
          {finishCut && <span className="frieze-end">Barrière d'arrivée {formatClock(finishCut.at)}</span>}
        </div>
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
          <div className="plan-hero-watch">
            <span className="plan-hero-watch-title">À surveiller</span>
            <span className="plan-hero-tight">
              Barrière la plus serrée : <strong>{tightest.eta.name}</strong>{' '}
              <StatusBadge status={tightest.eta.status} minutes={tightest.cutoff.marginMinutes} />
            </span>
            {showWorst && (
              <button type="button" className="plan-hero-worst" onClick={() => onSelect(worst.scenario)}>
                Au pire ({plans[worst.scenario].scenario.name.toLowerCase()}) : <strong>{worst.eta.name}</strong>{' '}
                <StatusBadge status={worst.eta.status} minutes={worst.cutoff.marginMinutes} />{' '}
                <span className="plan-hero-worst-see">voir</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** « sam 02h35 » → [« sam », « 02h35 »] : le jour s'écrit plus petit que l'heure. */
function splitClock(text: string): [string, string] {
  const i = text.indexOf(' ');
  return i < 0 ? ['', text] : [text.slice(0, i), text.slice(i + 1)];
}
