import { useEffect, useState } from 'react';
import { fetchRunnerProfile, fetchStravaStatus, humanError } from '../api/client';
import type { RaceResult, StoredRunnerProfile } from '../api/storage';
import type { RunnerProfile, SlopePoint } from '../api/types';
import { formatKm } from '../lib/format';
import { STANDARD_FATIGUE, fatigueEffect, racesFatigue, slopeLabel, slopeVerdict } from '../lib/runner';
import { connectStrava } from '../api/native';
import { StravaLogo } from './StravaLogo';

interface Props {
  stored: StoredRunnerProfile;
  onChange: (next: StoredRunnerProfile) => void;
  /** Le profil ne s'applique qu'à ta course, pas à l'exemple. */
  isExample: boolean;
}

/**
 * Ton profil de coureur : ton coût selon la pente et ta fatigue, mesurés sur tes sorties Strava (voir
 * RunnerCalibration côté serveur), et le choix de l'utiliser dans le plan.
 */
export function RunnerProfileCard({ stored, onChange, isExample }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStravaStatus().then((s) => setConnected(s.configured && s.connected)).catch(() => setConnected(false));
  }, []);

  async function measure() {
    setMeasuring(true);
    setError(null);
    try {
      const profile = await fetchRunnerProfile();
      onChange({ ...stored, profile, use: true, measuredAt: new Date().toISOString() });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setMeasuring(false);
    }
  }

  const p = stored.profile;
  return (
    <section className="card runner-profile">
      <div className="card-head">
        <h2><span className="strava-mark small"><StravaLogo size={13} /></span> Ton profil de coureur</h2>
        <p className="muted small">
          Ton rythme selon la pente, mesuré point par point sur tes sorties Strava de l'année (les plus longues et les
          plus vallonnées), et ta fatigue, mesurée sur tes courses (retour de course, ci-dessous). Sans profil, le plan
          suit le coureur moyen.
        </p>
      </div>

      {p ? <ProfileDetail profile={p} /> : (
        <p>Pas encore de profil de pente.{connected === false && ' Connecte Strava (dans « Mon plan », Importer depuis Strava) pour le mesurer.'}</p>
      )}
      <FatigueDetail races={stored.races} />

      {(p || stored.races.length > 0) && (
        <label className="check runner-use">
          <input type="checkbox" checked={stored.use} onChange={(e) => onChange({ ...stored, use: e.target.checked })} />
          Utiliser mon profil dans le plan{isExample ? ' de ma course' : ''}
        </label>
      )}
      {p && isExample && stored.use && <p className="muted small">L'exemple garde le coureur moyen : ton profil s'applique à ta course.</p>}

      <div className="runner-actions">
        {connected ? (
          <button type="button" className={p ? 'ghost' : ''} onClick={() => void measure()} disabled={measuring}>
            {measuring ? 'Mesure en cours…' : p ? 'Remesurer sur Strava' : 'Mesurer mon profil sur Strava'}
          </button>
        ) : connected === false && (
          <button type="button" className="strava-btn" onClick={connectStrava}><StravaLogo /> Connecter Strava</button>
        )}
        {p && (
          <button type="button" className="link-btn"
            onClick={() => onChange({ ...stored, profile: null, measuredAt: null, use: stored.use && stored.races.length > 0 })}>
            Oublier mon profil
          </button>
        )}
      </div>
      {measuring && <p className="muted small" role="status">Lecture de tes sorties sur Strava : une quinzaine de secondes.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}

function ProfileDetail({ profile }: { profile: RunnerProfile }) {
  const climbs = profile.slope.filter((s) => s.grade > 0.02);
  const descents = profile.slope.filter((s) => s.grade < -0.02).reverse();
  const period = profile.from && profile.to
    ? ` du ${new Date(profile.from).toLocaleDateString('fr-FR')} au ${new Date(profile.to).toLocaleDateString('fr-FR')}` : '';
  return (
    <>
      <p className="small">
        Mesuré sur <strong>{profile.activities} sortie{profile.activities > 1 ? 's' : ''}</strong> ({formatKm(profile.km)} km){period}.
        {profile.activities < 5 && ' Peu de sorties : ton profil reste proche du coureur moyen, il se précisera avec les suivantes.'}
      </p>
      <div className="runner-grid">
        <SlopeTable title="En montée" points={climbs} />
        <SlopeTable title="En descente" points={descents} />
      </div>
    </>
  );
}

/** Fatigue : celle des courses analysées, sinon celle du coureur moyen. */
function FatigueDetail({ races }: { races: RaceResult[] }) {
  const fatigue = racesFatigue(races);
  const counted = races.filter((r) => r.use && r.fatigueExponent !== null).length;
  const effect = fatigue === null ? null : fatigueEffect(fatigue);
  return (
    <div className="runner-fatigue">
      <h3>Fatigue</h3>
      {effect === null ? (
        <p className="small">
          Celle du coureur moyen, en attendant une course analysée (retour de course, ci-dessous). Tes sorties
          d'entraînement, courues à allure maîtrisée, ne disent rien de ta fatigue sur une course à fond.
        </p>
      ) : (
        <p className="small">
          {effect.verdict} Sur une course 2,5 fois plus longue que ta référence, ton temps estimé
          {Math.abs(effect.longRacePercent) < 1 ? ' ne change presque pas' : ` ${effect.longRacePercent > 0 ? 'augmente' : 'baisse'} de ${Math.abs(effect.longRacePercent)} %`}
          {' '}par rapport au coureur moyen. <span className="muted">(D'après {counted} course{counted > 1 ? 's' : ''} ; exposant
          {' '}{fatigue!.toFixed(2).replace('.', ',')}, moyenne {STANDARD_FATIGUE.toFixed(2).replace('.', ',')}.)</span>
        </p>
      )}
    </div>
  );
}

function SlopeTable({ title, points }: { title: string; points: SlopePoint[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {points.length === 0 ? <p className="muted small">Pas assez de mesures.</p> : (
        <table className="runner-slope">
          <thead><tr><th scope="col">Pente</th><th scope="col">Toi, comparé au coureur moyen</th></tr></thead>
          <tbody>
            {points.map((s) => {
              const v = slopeVerdict(s.ratio);
              return (
                <tr key={s.grade}>
                  <td className="num">{slopeLabel(s.grade)}</td>
                  <td className={`runner-verdict ${v.tone}`}>{v.text} <span className="muted small">· {formatKm(s.km)} km mesurés</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
