import type { Marker, RacePlan, Service } from '../api/types';
import { SERVICE_INFO } from '../lib/services';
import { durationMinutes, formatClock, formatDuration, formatKm, formatPace } from '../lib/format';
import { bindingCutoff } from '../lib/plan';
import { StatusBadge } from './StatusBadge';

interface Props {
  plan: RacePlan;
  markers: Marker[];
  /** Services de chaque point, dans l'ordre du plan (roadbook de la course). */
  services: Service[][];
  onHover: (trackKm: number | null) => void;
  /** Version allégée (point, km, passage, barrière, marge) avec un lien vers le tableau détaillé. */
  onDetails?: () => void;
}

export function PassageTable({ plan, markers, services, onHover, onDetails }: Props) {
  const simple = onDetails !== undefined;
  return (
    <div className={simple ? 'card passages-simple' : 'card'}>
      <div className="card-head">
        <h2>Heures de passage · scénario {plan.scenario.name.toLowerCase()}</h2>
        {simple ? (
          <button type="button" className="link-btn" onClick={onDetails}>Tableau détaillé</button>
        ) : (
          <p className="muted small">
            Arrivée {formatClock(plan.finish)} en {formatDuration(plan.totalDuration)}, dont {formatDuration(plan.totalStops)} d'arrêts
            et {formatDuration(plan.nightDuration)} de nuit.
          </p>
        )}
      </div>
      <div className="table-scroll">
        <table className="passages">
          <thead>
            <tr>
              <th>Point</th>
              <th className="num opt">Km</th>
              {!simple && <>
                <th className="num opt">D+</th>
                <th className="num opt">Tronçon</th>
                <th className="num opt">Allure</th>
                <th className="num opt">Arrêt</th>
              </>}
              <th className="num">Arrivée</th>
              <th className="num">Barrière</th>
              <th className="num">Marge</th>
            </tr>
          </thead>
          <tbody>
            {plan.checkpoints.map((eta, i) => {
              const cutoff = bindingCutoff(eta);
              const stop = durationMinutes(eta.stop);
              const marker = markers[i];
              return (
                <tr
                  key={eta.code}
                  className={`status-row-${eta.status.toLowerCase()}`}
                  onMouseEnter={() => marker && onHover(marker.trackKm)}
                  onMouseLeave={() => onHover(null)}
                >
                  <td>
                    <span className="code" title={i === 0 ? 'Départ (code du roadbook)' : i === plan.checkpoints.length - 1
                      ? 'Arrivée (code du roadbook)' : 'Code du point dans le roadbook'}>{eta.code}</span> {eta.name}
                    <ServiceIcons services={services[i] ?? []} />
                    <small className="muted mobile-only">km {formatKm(eta.km)}</small>
                  </td>
                  <td className="num opt">{formatKm(eta.km)}</td>
                  {!simple && <>
                    <td className="num opt">{Math.round(eta.cumulativeGainM)}</td>
                    <td className="num opt">
                      {i > 0 && (
                        <>
                          {formatDuration(eta.legDuration)}
                          <small className="muted leg-detail">{formatKm(eta.legDistanceKm)} km · +{Math.round(eta.legGainM)} m</small>
                        </>
                      )}
                    </td>
                    <td className="num opt">{i > 0 && formatPace(eta.legPaceMinPerKm)}</td>
                    <td className="num opt">{stop > 0 ? `${Math.round(stop)} min` : ''}</td>
                  </>}
                  <td className="num strong">{formatClock(eta.arrival)}</td>
                  <td className="num">
                    {cutoff && (
                      <>
                        {formatClock(cutoff.at)}
                        {cutoff.out && <small className="muted cutoff-out" title="Barrière en sortie de ravito"> sortie</small>}
                      </>
                    )}
                  </td>
                  <td className="num">
                    {cutoff && <StatusBadge status={eta.status} minutes={cutoff.marginMinutes} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {codesNote(plan) && <p className="muted small table-note">{codesNote(plan)}</p>}
    </div>
  );
}

/** Services du point : chaque icône avec son mot, pour qu'on n'ait pas à chercher la légende. */
function ServiceIcons({ services }: { services: Service[] }) {
  if (services.length === 0) return null;
  return (
    <span className="service-icons">
      {services.map((s) => (
        <span key={s} className="service" title={SERVICE_INFO[s].label}>
          <span aria-hidden>{SERVICE_INFO[s].icon}</span> {SERVICE_INFO[s].short}
        </span>
      ))}
    </span>
  );
}

/** Les codes du roadbook (1P, 1D…) ne parlent qu'à qui l'a lu : on dit lesquels sont le départ et l'arrivée. */
export function codesNote(plan: RacePlan): string | null {
  const first = plan.checkpoints[0]?.code;
  const last = plan.checkpoints[plan.checkpoints.length - 1]?.code;
  if (!first || !last || (/^\d+$/.test(first) && /^\d+$/.test(last))) return null;
  return `Codes du roadbook officiel : ${first} = départ, ${last} = arrivée.`;
}
