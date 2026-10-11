import type { RacePlan } from '../api/types';
import { formatClock, formatHm, formatKm } from '../lib/format';
import { bindingCutoff } from '../lib/plan';
import { StatusBadge } from './StatusBadge';

/** Les trois scénarios côte à côte : le tableau à glisser dans la poche (ou à donner à l'assistance). */
export function CompareTable({ plans }: { plans: RacePlan[] }) {
  const reference = plans[0];
  return (
    <div className="card compare">
      <div className="card-head">
        <h2>Comparaison des scénarios</h2>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Point</th>
              <th className="num opt">Km</th>
              <th className="num opt">Barrière</th>
              {plans.map((p) => <th key={p.scenario.name} className="num">{p.scenario.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {reference.checkpoints.map((eta, i) => {
              const cutoff = bindingCutoff(eta);
              return (
                <tr key={eta.code}>
                  <td>
                    <span className="code">{eta.code}</span> {eta.name}
                    {cutoff && <small className="muted mobile-only">barrière {formatClock(cutoff.at)}</small>}
                  </td>
                  <td className="num opt">{formatKm(eta.km)}</td>
                  <td className="num opt">{cutoff ? formatClock(cutoff.at) : ''}</td>
                  {plans.map((p) => {
                    const e = p.checkpoints[i];
                    const c = bindingCutoff(e);
                    return (
                      <td key={p.scenario.name} className="num">
                        <span className="strong">{formatClock(e.arrival)}</span>
                        {c && <> <StatusBadge status={e.status}>{formatHm(c.marginMinutes)}</StatusBadge></>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
