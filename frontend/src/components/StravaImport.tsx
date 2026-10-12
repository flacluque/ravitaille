import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, disconnectStrava, fetchStravaActivities, fetchStravaStatus, stravaConnectUrl } from '../api/client';
import type { Reference, ReferenceKind, StravaActivity, StravaStatus } from '../api/types';
import { durationMinutes, formatHm, formatKm, formatMeters } from '../lib/format';
import {
  activityToReference, closest, connectionMessage, filterActivities, isAlreadyReference, sortActivities, SPORT_LABELS,
  yearsAgo, type Target,
} from '../lib/strava';

interface Props {
  /** Références déjà saisies : les sorties correspondantes sont signalées. */
  existing: Reference[];
  /** Course préparée : les sorties qui lui ressemblent le plus sont mises en avant. */
  target: Target | null;
  onAdd: (refs: Reference[]) => void;
  onClose: () => void;
  /** Résultat du retour de la page d'autorisation de Strava (?strava=connected…). */
  connectionResult: string | null;
}

const frDate = (iso: string) => iso.split('-').reverse().join('/');

/** Import des sorties Strava comme références. */
export function StravaImport({ existing, target, onAdd, onClose, connectionResult }: Props) {
  const message = connectionMessage(connectionResult);
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [activities, setActivities] = useState<StravaActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(() => yearsAgo(2));
  const [minKm, setMinKm] = useState(10);
  const [racesOnly, setRacesOnly] = useState(false);
  const [byCloseness, setByCloseness] = useState(target !== null);
  /** Sorties cochées, avec le type choisi. */
  const [selected, setSelected] = useState<Map<number, ReferenceKind>>(new Map());

  const refreshStatus = useCallback(() => {
    setStatusError(null);
    fetchStravaStatus().then(setStatus).catch((e) => setStatusError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refreshStatus, [refreshStatus]);

  useEffect(() => {
    if (!status?.connected || !since) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStravaActivities(since)
      .then((list) => { if (!cancelled) setActivities(list); })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        // Accès révoqué : l'API a oublié les jetons, on repasse sur « Connecter ».
        if (e instanceof ApiError) refreshStatus();
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status?.connected, since, refreshStatus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const filtered = filterActivities(activities ?? [], { minKm, racesOnly });
    return sortActivities(filtered, byCloseness ? target : null);
  }, [activities, minKm, racesOnly, byCloseness, target]);
  const near = useMemo(() => closest(filterActivities(activities ?? [], { minKm: 0, racesOnly: false }), target), [activities, target]);

  const toggle = (a: StravaActivity) => setSelected((s) => {
    const next = new Map(s);
    if (next.has(a.id)) next.delete(a.id);
    else next.set(a.id, a.race ? 'RACE' : 'TRAINING');
    return next;
  });
  const setKind = (a: StravaActivity, kind: ReferenceKind) => setSelected((s) => new Map(s).set(a.id, kind));

  function add() {
    const chosen = (activities ?? []).filter((a) => selected.has(a.id));
    onAdd(chosen.map((a) => activityToReference(a, selected.get(a.id)!)));
  }

  async function disconnect() {
    await disconnectStrava().catch(() => undefined);
    setActivities(null);
    setSelected(new Map());
    refreshStatus();
  }

  // Hors du formulaire des références : ni ses styles, ni l'envoi du formulaire par la touche Entrée.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal strava" role="dialog" aria-modal="true" aria-labelledby="strava-title">
        <div className="modal-head">
          <h2 id="strava-title">Importer depuis Strava</h2>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {message && <p className={message.ok ? 'strava-msg ok' : 'strava-msg'} role="status">{message.text}</p>}
        {statusError && <p className="field-error" role="alert">L'API ne répond pas : {statusError}</p>}
        {!status && !statusError && <p className="muted">Vérification de la connexion…</p>}

        {status && !status.configured && (
          <div className="strava-setup">
            {status.problem && status.problem !== "Strava n'est pas configuré." && (
              <p className="field-error" role="alert">{status.problem}</p>
            )}
            <p>L'import Strava demande une <strong>application API Strava</strong>, gratuite, à créer une fois :</p>
            <ol>
              <li>Sur <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a>,
                crée une application : nom « Trail Planner », site web <code>http://localhost</code>,
                domaine de rappel <code>localhost</code>.</li>
              <li>À la racine du projet, crée le fichier <code>config/application.properties</code> (ignoré par git),
                avec le <strong>Client ID</strong> (un nombre) et le <strong>Client Secret</strong> de cette page :
                <pre>{'trailplanner.strava.client-id=123456\ntrailplanner.strava.client-secret=<secret>'}</pre></li>
              <li>Redémarre l'API, puis <button type="button" className="link-btn" onClick={refreshStatus}>revérifie</button>.</li>
            </ol>
          </div>
        )}

        {status?.configured && !status.connected && (
          <div className="strava-connect">
            <p>Autorise Trail Planner à lire tes activités. Tes identifiants Strava ne passent jamais par l'appli,
              et tu peux révoquer l'accès à tout moment.</p>
            <button type="button" onClick={() => window.location.assign(stravaConnectUrl())}>Connecter mon compte Strava</button>
            {error && <p className="field-error" role="alert">{error}</p>}
          </div>
        )}

        {status?.connected && (
          <>
            <p className="muted small strava-account">
              Connecté : {status.athlete ?? 'compte Strava'} ·{' '}
              <button type="button" className="link-btn" onClick={() => void disconnect()}>se déconnecter</button>
            </p>
            <div className="strava-filters">
              <label><span>Depuis le</span>
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} /></label>
              <label><span>Au moins (km)</span>
                <input type="number" min={0} step={5} inputMode="numeric" value={minKm}
                  onChange={(e) => setMinKm(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label className="check"><input type="checkbox" checked={racesOnly} onChange={(e) => setRacesOnly(e.target.checked)} />
                Courses seulement</label>
              {target && (
                <label className="check"><input type="checkbox" checked={byCloseness} onChange={(e) => setByCloseness(e.target.checked)} />
                  Les plus proches de ma course d'abord</label>
              )}
            </div>

            {loading && <p className="scan-progress" role="status"><span className="spinner" aria-hidden /> Lecture de tes activités…</p>}
            {error && <p className="field-error" role="alert">{error}</p>}
            {!loading && activities && shown.length === 0 && (
              <p className="muted">Aucune sortie de course à pied ou de trail avec ces filtres.</p>
            )}

            {shown.length > 0 && (
              <ul className="strava-list">
                {shown.map((a) => {
                  const already = isAlreadyReference(a, existing);
                  const kind = selected.get(a.id);
                  return (
                    <li key={a.id} className={kind ? 'selected' : already ? 'already' : undefined}>
                      <label className="strava-pick">
                        <input type="checkbox" checked={!!kind} disabled={already} onChange={() => toggle(a)} />
                        <span className="strava-name">
                          <strong>{a.name || 'Sans titre'}</strong>
                          <span className="muted small">
                            {frDate(a.date)} · {SPORT_LABELS[a.sportType] ?? a.sportType}
                            {a.race && ' · course'}
                            {near.has(a.id) && <span className="strava-tag">proche de ta course</span>}
                            {already && <span className="strava-tag muted-tag">déjà dans tes références</span>}
                          </span>
                        </span>
                      </label>
                      <span className="strava-figures">
                        <span>{formatKm(a.distanceKm)} km</span>
                        <span>{formatMeters(a.elevationGainM)} D+</span>
                        <span title={`En mouvement : ${formatHm(durationMinutes(a.movingTime))}`}>{formatHm(durationMinutes(a.elapsedTime))}</span>
                      </span>
                      {kind && (
                        <select value={kind} onChange={(e) => setKind(a, e.target.value as ReferenceKind)} aria-label={`Type de ${a.name}`}>
                          <option value="RACE">Course</option>
                          <option value="TRAINING">Entraînement</option>
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="modal-foot">
              <span className="muted small">Temps écoulé, arrêts compris, comme le veut le calcul.</span>
              <button type="button" onClick={add} disabled={selected.size === 0}>
                {selected.size > 1 ? `Ajouter ${selected.size} références` : 'Ajouter la référence'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
