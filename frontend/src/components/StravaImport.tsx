import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, disconnectStrava, fetchStravaActivities, fetchStravaStatus, stravaConnectUrl } from '../api/client';
import { MAX_PREP_WEEKS, MIN_PREP_WEEKS } from '../api/storage';
import type { Reference, ReferenceKind, StravaActivity, StravaStatus, TrainingOptions } from '../api/types';
import { durationMinutes, formatHm, formatKm, formatMeters } from '../lib/format';
import { StravaLogo } from './StravaLogo';
import {
  activityToReference, blockSummary, closest, connectionMessage, isAlreadyReference, keySessions, sortActivities,
  splitByBlock, SPORT_LABELS, weeksAgo, yearsAgo, type Target,
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
  /** Durée de la préparation (partagée avec le réglage « forme ») ; l'import active sa prise en compte. */
  training: TrainingOptions;
  onTrainingChange: (options: TrainingOptions) => void;
}

const PREP_WEEKS = Array.from({ length: MAX_PREP_WEEKS - MIN_PREP_WEEKS + 1 }, (_, i) => MIN_PREP_WEEKS + i);
const LOOKBACK_YEARS = [1, 2, 3, 5];

const frDate = (iso: string) => iso.split('-').reverse().join('/');

/** Import des sorties Strava comme références. */
export function StravaImport({ existing, target, onAdd, onClose, connectionResult, training, onTrainingChange }: Props) {
  const message = connectionMessage(connectionResult);
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [activities, setActivities] = useState<StravaActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weeks = training.weeks;
  /** Ancienneté des courses passées proposées, en années. */
  const [lookback, setLookback] = useState(2);
  const since = useMemo(() => yearsAgo(Math.max(lookback, 1)), [lookback]);
  const [showAllBlock, setShowAllBlock] = useState(false);
  const [olderTrainings, setOlderTrainings] = useState(false);
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

  const blockStart = useMemo(() => weeksAgo(weeks), [weeks]);
  const { block, older } = useMemo(() => splitByBlock(activities ?? [], blockStart), [activities, blockStart]);
  const summary = useMemo(() => blockSummary(block, weeks), [block, weeks]);
  // Les références arrivent recréées à chaque rendu : on ne recalcule que si leur contenu change.
  const existingSig = existing.map((r) => `${r.date}|${r.km}`).join(',');
  const key = useMemo(() => keySessions(block, target, existing), [block, target, existingSig]);
  const keyIds = useMemo(() => new Set(key.map((a) => a.id)), [key]);
  const otherBlock = useMemo(() => block.filter((a) => !keyIds.has(a.id)), [block, keyIds]);
  const olderShown = useMemo(
    () => sortActivities(older.filter((a) => olderTrainings || a.race), target), [older, olderTrainings, target]);
  const near = useMemo(() => closest(activities ?? [], target), [activities, target]);

  // Sorties clés du bloc cochées d'office ; on garde ce qui a été coché plus tôt hors du bloc.
  const keySig = key.map((a) => a.id).join(',');
  useEffect(() => {
    setSelected((s) => {
      const next = new Map([...s].filter(([id]) => older.some((a) => a.id === id)));
      key.forEach((a) => next.set(a.id, a.race ? 'RACE' : 'TRAINING'));
      return next;
    });
  }, [keySig, blockStart]);

  const toggle = (a: StravaActivity) => setSelected((s) => {
    const next = new Map(s);
    if (next.has(a.id)) next.delete(a.id);
    else next.set(a.id, a.race ? 'RACE' : 'TRAINING');
    return next;
  });
  const setKind = (a: StravaActivity, kind: ReferenceKind) => setSelected((s) => new Map(s).set(a.id, kind));

  function add() {
    const chosen = (activities ?? []).filter((a) => selected.has(a.id));
    // Tout le bloc sert à mesurer la forme : on active sa prise en compte.
    if (!training.strava) onTrainingChange({ ...training, strava: true });
    onAdd(chosen.map((a) => activityToReference(a, selected.get(a.id)!)));
  }

  async function disconnect() {
    await disconnectStrava().catch(() => undefined);
    setActivities(null);
    setSelected(new Map());
    refreshStatus();
  }

  function row(a: StravaActivity) {
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
  }

  // Hors du formulaire des références : ni ses styles, ni l'envoi du formulaire par la touche Entrée.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal strava" role="dialog" aria-modal="true" aria-labelledby="strava-title">
        <div className="modal-head strava-head">
          <h2 id="strava-title"><span className="strava-mark"><StravaLogo size={18} /></span> Importer depuis Strava</h2>
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
            <button type="button" className="strava-btn" onClick={() => window.location.assign(stravaConnectUrl())}>
              <StravaLogo /> Se connecter avec Strava
            </button>
            {error && <p className="field-error" role="alert">{error}</p>}
          </div>
        )}

        {status?.connected && (
          <>
            <p className="muted small strava-account">
              Connecté : {status.athlete ?? 'compte Strava'} ·{' '}
              <button type="button" className="link-btn" onClick={() => void disconnect()}>se déconnecter</button>
            </p>
            {loading && <p className="scan-progress" role="status"><span className="spinner" aria-hidden /> Lecture de tes activités…</p>}
            {error && <p className="field-error" role="alert">{error}</p>}

            {activities && <>
              <section className="strava-step">
                <h3>1. Ta préparation</h3>
                <label className="prep-weeks">
                  <span>Elle dure</span>
                  <select value={weeks} onChange={(e) => onTrainingChange({ ...training, weeks: Number(e.target.value) })}>
                    {PREP_WEEKS.map((w) => <option key={w} value={w}>{w} semaines</option>)}
                  </select>
                  <span className="muted small">depuis le {frDate(blockStart)}</span>
                </label>
                {summary.sessions === 0 ? (
                  <p className="muted">Aucune sortie de course à pied ou de trail sur cette période.</p>
                ) : (
                  <p className="strava-summary">
                    <strong>{summary.sessions} sorties</strong> · {formatKm(summary.km)} km · {formatMeters(summary.gainM)} D+
                    {' · '}{formatKm(summary.kmPerWeek)} km/semaine
                    {summary.longest && <> · plus longue : {formatKm(summary.longest.distanceKm)} km</>}
                  </p>
                )}
                <p className="muted small">
                  Toutes ces sorties mesurent ta forme du moment (volume, sortie longue). Comme références, on ne garde
                  que les courses et les {key.filter((a) => !a.race).length || 'quelques'} sorties qui ressemblent le plus
                  à ta course : un footing ne dit rien de ton allure sur un ultra.
                </p>
                {key.length > 0 && <ul className="strava-list">{key.map(row)}</ul>}
                {otherBlock.length > 0 && (
                  <button type="button" className="link-btn" onClick={() => setShowAllBlock((v) => !v)} aria-expanded={showAllBlock}>
                    {showAllBlock ? 'Masquer les autres sorties' : `Voir les ${otherBlock.length} autres sorties du bloc`}
                  </button>
                )}
                {showAllBlock && <ul className="strava-list">{otherBlock.map(row)}</ul>}
              </section>

              <section className="strava-step">
                <h3>2. Anciennes courses <span className="muted small">(facultatif)</span></h3>
                <div className="strava-filters">
                  <label><span>Sur les</span>
                    <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
                      {LOOKBACK_YEARS.map((y) => <option key={y} value={y}>{y === 1 ? 'douze derniers mois' : `${y} dernières années`}</option>)}
                    </select></label>
                  <label className="check"><input type="checkbox" checked={olderTrainings} onChange={(e) => setOlderTrainings(e.target.checked)} />
                    Afficher aussi les entraînements</label>
                </div>
                {olderShown.length === 0 ? (
                  <p className="muted small">
                    Aucune {olderTrainings ? 'sortie' : 'course'} avant ta préparation sur cette période.
                    {!olderTrainings && ' Dans Strava, une course se marque avec le type de sortie « Course ».'}
                  </p>
                ) : (
                  <ul className="strava-list">{olderShown.map(row)}</ul>
                )}
              </section>
            </>}

            <div className="modal-foot">
              <span className="muted small">Temps écoulé, arrêts compris, comme le veut le calcul.</span>
              <button type="button" className="strava-btn" onClick={add} disabled={selected.size === 0}>
                {selected.size > 1 ? `Ajouter ${selected.size} références` : 'Ajouter la référence'}
              </button>
            </div>
          </>
        )}
        <p className="strava-powered"><StravaLogo size={12} /> Données d'activité fournies par Strava</p>
      </div>
    </div>,
    document.body,
  );
}
