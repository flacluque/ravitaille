import type { RacePlan, Service } from '../api/types';
import { formatClock } from '../lib/format';
import { computeNutrition, describeActions, type NutritionProfile } from '../lib/nutrition';
import { SERVICE_INFO } from '../lib/services';

interface Props {
  plan: RacePlan;
  services: Service[][];
  profile: NutritionProfile;
}

/** Ce qu'il faut faire au départ et à chaque ravito, dans l'ordre de la course : la question du jour J. */
export function RavitosCard({ plan, services, profile }: Props) {
  const n = computeNutrition(plan, services, profile);
  const etas = plan.checkpoints;
  const start = describeActions(n.points[0], n, profile, true);
  const stops = etas.map((eta, i) => ({ eta, i, todo: i > 0 && i < etas.length - 1 ? describeActions(n.points[i], n, profile, false) : '' }))
    .filter((s) => s.todo);
  return (
    <>
      <section className="card ravitos-start">
        <h2>Au départ · {formatClock(plan.start)}</h2>
        <p className="muted small">
          {profile.carbsPerHour} g de glucides par heure · {profile.flasks} flasque{profile.flasks > 1 ? 's' : ''} de {profile.flaskMl} ml
          · scénario {plan.scenario.name.toLowerCase()}
        </p>
        <p className="ravitos-todo">{start || 'Rien à préparer.'}</p>
        {n.alerts.length > 0 && <ul className="warnings">{n.alerts.map((a) => <li key={a}>{a}</li>)}</ul>}
      </section>
      <section className="card ravitos-list">
        <h2>À chaque ravito</h2>
        {stops.length === 0 && <p className="muted">Rien à faire en route d'après ton profil.</p>}
        <ol>
          {stops.map(({ eta, i, todo }) => (
            <li key={eta.code}>
              <span className="ravitos-time">{formatClock(eta.arrival).replace(/^\S+ /, '')}</span>
              <span className="ravitos-body">
                <strong>{eta.name}</strong>
                <span className="muted small">km {eta.km.toLocaleString('fr-FR')}
                  {(services[i] ?? []).length > 0 && <> · {(services[i] ?? []).map((s) => SERVICE_INFO[s].short).join(', ')}</>}
                </span>
                <span className="ravitos-todo">{todo}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
