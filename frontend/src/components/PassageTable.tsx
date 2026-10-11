import type { Marker, RacePlan } from '../api/types';
import { durationMinutes, formatClock, formatDuration, formatHm, formatKm, formatPace } from '../lib/format';
import { bindingCutoff } from '../lib/plan';
import { StatusBadge } from './StatusBadge';

interface Props {
  plan: RacePlan;
  markers: Marker[];
  onHover: (trackKm: number | null) => void;
}

export function PassageTable({ plan, markers, onHover }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Heures de passage · scénario {plan.scenario.name.toLowerCase()}</h2>
        <p className="muted small">
          Arrivée {formatClock(plan.finish)} en {formatDuration(plan.totalDuration)}, dont {formatDuration(plan.totalStops)} d'arrêts
          et {formatDuration(plan.nightDuration)} de nuit.
        </p>
      </div>
      <div className="table-scroll">
        <table className="passages">
          <thead>
            <tr>
              <th>Point</th>
              <th className="num opt">Km</th>
              <th className="num opt">D+</th>
              <th className="num opt">Tronçon</th>
              <th className="num opt">Allure</th>
              <th className="num opt">Arrêt</th>
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
                    <span className="code">{eta.code}</span> {eta.name}
                    <small className="muted mobile-only">km {formatKm(eta.km)}</small>
                  </td>
                  <td className="num opt">{formatKm(eta.km)}</td>
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
                    {cutoff && <StatusBadge status={eta.status}>{formatHm(cutoff.marginMinutes)}</StatusBadge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
