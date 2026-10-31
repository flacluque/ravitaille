import { useEffect, useMemo, useState } from 'react';
import { fetchRaceReview, fetchStravaActivities, fetchStravaStatus, humanError } from '../api/client';
import type { RaceResult, StoredRunnerProfile } from '../api/storage';
import type { CourseView, RacePlan, RaceReview, StravaActivity } from '../api/types';
import { formatClockFromMinutes, formatHm, formatKm, formatMeters, localMinutes } from '../lib/format';
import { compareRace } from '../lib/review';
import { STANDARD_FATIGUE, fatigueEffect } from '../lib/runner';
import { ConnectWithStrava, PoweredByStrava, ViewOnStrava } from './StravaBrand';

interface Props {
  plan: RacePlan;
  course: CourseView;
  stored: StoredRunnerProfile;
  onChange: (next: StoredRunnerProfile) => void;
}

const SHOWN = 8;

/** « −21 min », « +1h05 », « = » */
function gapText(minutes: number): string {
  const m = Math.round(minutes);
  if (m === 0) return '=';
  const abs = Math.abs(m);
  return `${m > 0 ? '+' : '−'}${abs < 60 ? `${abs} min` : formatHm(abs)}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Retour de course : après la course, son activité Strava est comparée au plan, ravito par ravito, et la fatigue
 * mesurée dessus sert aux plans suivants (si le coureur la compte).
 */
export function RaceReviewCard({ plan, course, stored, onChange }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<StravaActivity[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [review, setReview] = useState<RaceReview | null>(null);
  const [count, setCount] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStravaStatus().then((s) => setConnected(s.configured && s.connected)).catch(() => setConnected(false));
  }, []);

  const raceDate = course.race.start.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = raceDate > today;

  async function pick() {
    setBusy(true);
    setError(null);
    try {
      setActivities(await fetchStravaActivities(addDays(upcoming ? today : raceDate, upcoming ? -60 : -3)));
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  // Le jour de la course d'abord, puis les sorties de distance proche.
  const candidates = useMemo(() => (activities ?? []).slice().sort((a, b) => {
    const day = Number(b.date === raceDate) - Number(a.date === raceDate);
    return day || Math.abs(a.distanceKm - plan.totalDistanceKm) - Math.abs(b.distanceKm - plan.totalDistanceKm);
  }).slice(0, SHOWN), [activities, raceDate, plan.totalDistanceKm]);
  useEffect(() => { if (candidates.length > 0 && chosen === null) setChosen(candidates[0].id); }, [candidates, chosen]);

  async function analyse() {
    if (chosen === null) return;
    setBusy(true);
    setError(null);
    try {
      setReview(await fetchRaceReview(chosen, stored.profile));
      setCount(true);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const a = activities?.find((x) => x.id === review?.activityId);
    if (!review || !a) return;
    // Le nom et la distance sont ceux de la course préparée : de Strava, on ne garde que l'activité (pour l'effacer si
    // elle disparaît de Strava), sa date (vérifiée chaque jour avec elle) et la fatigue mesurée.
    const result: RaceResult = { activityId: a.id, name: course.race.name, date: a.date, distanceKm: plan.totalDistanceKm,
      fatigueExponent: review.fatigueExponent, use: count && review.fatigueExponent !== null };
    onChange({ ...stored, use: stored.use || result.use, races: [...stored.races.filter((r) => r.activityId !== a.id), result] });
    setReview(null);
    setActivities(null);
    setChosen(null);
  }

  const setRace = (id: number, patch: Partial<RaceResult> | null) => onChange({
    ...stored,
    races: patch === null ? stored.races.filter((r) => r.activityId !== id) : stored.races.map((r) => (r.activityId === id ? { ...r, ...patch } : r)),
  });

  const rows = review ? compareRace(plan, course, review) : [];
  const start = localMinutes(plan.start);
  const finish = rows[rows.length - 1];
  const effect = review?.fatigueExponent ? fatigueEffect(review.fatigueExponent) : null;

  return (
    <section className="card race-review">
      <div className="card-head">
        <h2>Retour de course</h2>
        <p className="muted small">
          Après ta course, choisis ton activité Strava : on compare ton temps à ton plan ({plan.scenario.name.toLowerCase()}),
          ravito par ravito, et ta fatigue sur cette course sert à tes prochains plans.
        </p>
      </div>

      {stored.races.length > 0 && (
        <div>
          <h3>Courses analysées</h3>
          <ul className="review-races">
            {stored.races.map((r) => (
              <li key={r.activityId}>
                <label className="check">
                  <input type="checkbox" checked={r.use} disabled={r.fatigueExponent === null}
                    onChange={(e) => setRace(r.activityId, { use: e.target.checked })} />
                  <span>
                    <strong>{r.name}</strong> · {new Date(r.date).toLocaleDateString('fr-FR')} · {formatKm(r.distanceKm)} km
                    <span className="muted small"> · {r.fatigueExponent === null ? 'trop courte pour mesurer la fatigue'
                      : `fatigue ${r.fatigueExponent.toFixed(2).replace('.', ',')}`}</span>
                  </span>
                </label>
                <span className="review-race-actions">
                  <ViewOnStrava id={r.activityId} />
                  <button type="button" className="link-btn" onClick={() => setRace(r.activityId, null)}>Retirer</button>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Décoche une course perturbée (blessure, chute, météo) : sa fatigue ne compte plus.</p>
        </div>
      )}

      {!review && (
        connected === false ? (
          <ConnectWithStrava />
        ) : activities === null ? (
          <div className="runner-actions">
            <button type="button" onClick={() => void pick()} disabled={busy || connected === null}>
              {busy ? 'Lecture de Strava…' : 'Choisir ma course sur Strava'}
            </button>
            {upcoming && <span className="muted small">Ta course est à venir : reviens après, ou choisis une course passée.</span>}
          </div>
        ) : candidates.length === 0 ? (
          <p className="muted small">Aucune sortie de course à pied ou de trail sur Strava autour du {new Date(raceDate).toLocaleDateString('fr-FR')}.</p>
        ) : (
          <fieldset className="review-pick">
            <legend className="small">Ta course :</legend>
            {candidates.map((a) => (
              <label key={a.id} className="check">
                <input type="radio" name="review-activity" checked={chosen === a.id} onChange={() => setChosen(a.id)} />
                <span><strong>{a.name || 'Sortie'}</strong> · {new Date(a.date).toLocaleDateString('fr-FR')} · {formatKm(a.distanceKm)} km
                  · {formatMeters(a.elevationGainM)} D+ · <ViewOnStrava id={a.id} /></span>
              </label>
            ))}
            <div className="runner-actions">
              <button type="button" onClick={() => void analyse()} disabled={busy || chosen === null}>
                {busy ? 'Analyse…' : 'Analyser cette course'}
              </button>
              <button type="button" className="link-btn" onClick={() => setActivities(null)}>Annuler</button>
            </div>
          </fieldset>
        )
      )}

      {review && finish && (
        <div className="review-result">
          <p>
            Temps réel <strong>{formatHm(review.elapsedMinutes)}</strong> (dont {formatHm(review.elapsedMinutes - review.movingMinutes)} d'arrêts)
            {' '}· prévu {formatHm(finish.planned)} · écart <strong>{gapText(review.elapsedMinutes - finish.planned)}</strong>
          </p>
          <table className="review-table">
            <thead><tr><th scope="col">Point</th><th scope="col" className="num">Prévu</th><th scope="col" className="num">Réel</th><th scope="col" className="num">Écart</th></tr></thead>
            <tbody>
              {rows.slice(1).map((r) => (
                <tr key={r.name + r.km}>
                  <td>{r.name} <span className="muted small">· {formatKm(r.km)} km</span></td>
                  <td className="num">{formatClockFromMinutes(start + r.planned)}</td>
                  <td className="num">{r.actual === null ? '—' : formatClockFromMinutes(start + r.actual)}</td>
                  <td className={`num ${r.actual !== null && r.actual - r.planned > 5 ? 'review-late' : r.actual !== null && r.actual - r.planned < -5 ? 'review-early' : ''}`}>
                    {r.actual === null ? '—' : gapText(r.actual - r.planned)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {effect ? (
            <>
              <p className="small">
                <strong>Ta fatigue sur cette course : {review.fatigueExponent!.toFixed(2).replace('.', ',')}</strong>
                {' '}(coureur moyen {STANDARD_FATIGUE.toFixed(2).replace('.', ',')}). {effect.verdict}
              </p>
              <label className="check">
                <input type="checkbox" checked={count} onChange={(e) => setCount(e.target.checked)} />
                Compter cette course pour ma fatigue
              </label>
              <p className="muted small">Décoche-la si la course a été perturbée (blessure, chute, météo) : elle fausserait tes prochains plans.</p>
            </>
          ) : (
            <p className="muted small">Sortie de moins de 2 h : trop courte pour mesurer ta fatigue.</p>
          )}
          <div className="runner-actions">
            <button type="button" onClick={save}>Enregistrer le retour de course</button>
            <button type="button" className="link-btn" onClick={() => setReview(null)}>Annuler</button>
          </div>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      {(stored.races.length > 0 || activities !== null || review) && <PoweredByStrava />}
    </section>
  );
}
