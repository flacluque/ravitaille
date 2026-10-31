import type { RacePlan } from '../api/types';
import { comparedReferences, formEffect, volumeChange } from '../lib/training';

/** La préparation résumée en une ligne ; le détail est dans l'onglet Analyse. */
export function TrainingLine({ plan, onDetails }: { plan: RacePlan; onDetails: () => void }) {
  const t = plan.training;
  if (!t) return null;
  // La référence qui pèse le plus dans le plan sert de point de comparaison.
  const main = [...comparedReferences(plan.references)].sort((a, b) => b.weight - a.weight)[0];
  return (
    <div className="card training-line">
      <span>
        <strong>Ta préparation :</strong>{' '}
        {t.active
          ? <>
              {Math.round(t.target.weeklyEffortKm)} km-effort par semaine
              {main && <>, {volumeChange(t.target.weeklyEffortKm, main.weeklyEffortKm)} par rapport à « {main.label} » → temps {formEffect(main.formFactor ?? 1)}</>}
            </>
          : 'pas prise en compte (pas assez d\'historique Strava)'}
        {t.notes.length > 0 && t.active && <span className="muted"> · {t.notes.length} remarque{t.notes.length > 1 ? 's' : ''}</span>}
      </span>
      <button type="button" className="link-btn" onClick={onDetails}>Voir le détail</button>
    </div>
  );
}
