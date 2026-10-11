import type { RacePlan } from '../api/types';
import { formatClock, formatDuration, formatKm } from '../lib/format';

/**
 * Ce que prédit chaque référence seule, et son poids dans le plan : le coureur voit sa progression
 * (une référence récente plus rapide) ou une référence qui détonne.
 */
export function ReferenceInsights({ plan }: { plan: RacePlan }) {
  const refs = plan.references;
  if (refs.length < 2) {
    return (
      <p className="hint-line muted small no-print">
        Astuce : ajoute une course ou une sortie chronométrée récente à tes références pour tenir compte de ta
        progression depuis ta course de référence.
      </p>
    );
  }
  return (
    <div className="card insights">
      <div className="card-head">
        <h2>Tes références · scénario {plan.scenario.name.toLowerCase()}</h2>
        <p className="muted small">
          Arrivée prédite par chaque référence seule, et son poids dans ton plan (arrivée {formatClock(plan.finish)}).
        </p>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Référence</th>
              <th className="opt">Date</th>
              <th className="num">Poids</th>
              <th className="num">Arrivée seule</th>
            </tr>
          </thead>
          <tbody>
            {refs.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <td>
                  <span className="strong">{r.label}</span>
                  {r.kind === 'TRAINING' && <span className="tag">entraînement</span>}
                  <small className="muted ref-detail">
                    {formatKm(r.distanceKm)} km · {Math.round(r.elevationGainM)} m D+ · {formatDuration(r.duration)}
                  </small>
                </td>
                <td className="opt">{r.date ? new Date(`${r.date}T12:00`).toLocaleDateString('fr-FR', { dateStyle: 'medium' }) : <span className="muted">—</span>}</td>
                <td className="num">
                  <span className="weight" title={weightTitle(r.recencyFactor, r.distanceFactor)}>
                    <span className="weight-bar" style={{ width: `${Math.round(r.weight * 100)}%` }} />
                    <span className="weight-value">{Math.round(r.weight * 100)} %</span>
                  </span>
                </td>
                <td className="num strong">{formatClock(r.predictedFinish)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function weightTitle(recency: number, distance: number): string {
  const parts = [];
  if (recency < 0.99) parts.push(`ancienneté ×${recency.toFixed(2).replace('.', ',')}`);
  if (distance < 0.99) parts.push(`écart de distance ×${distance.toFixed(2).replace('.', ',')}`);
  return parts.length ? parts.join(', ') : 'récente et de distance proche';
}
