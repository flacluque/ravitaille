import { useEffect, useState, type FormEvent } from 'react';
import { fetchStravaStatus } from '../api/client';
import { MAX_PREP_WEEKS, MIN_PREP_WEEKS } from '../api/storage';
import type { ElevationSource, Reference, ReferenceKind, TrainingOptions } from '../api/types';
import { durationMinutes, formatHm, formatKm, parseHmInput } from '../lib/format';
import type { Target } from '../lib/strava';
import { DatePicker } from './DatePicker';
import { StravaImport } from './StravaImport';
import { StravaLogo } from './StravaLogo';

interface Props {
  initialReferences: Reference[];
  initialSource: ElevationSource;
  loading: boolean;
  onSubmit: (references: Reference[], source: ElevationSource) => void;
  /** Distance et D+ de la course préparée, pour repérer les sorties Strava qui lui ressemblent. */
  target: Target | null;
  /** Tenir compte de l'entraînement Strava (proposé quand le compte est connecté). */
  training: TrainingOptions;
  onTrainingChange: (options: TrainingOptions) => void;
}

/** La référence d'exemple proposée au premier lancement (60 km, 3 200 m D+, 8h48), sans nom ni date. */
function isExampleReference(ref: Reference): boolean {
  return !ref.label.trim() && !ref.date && ref.km === 60 && ref.gainM === 3200 && durationMinutes(ref.time) === 528;
}

const SOURCES: { value: ElevationSource; label: string }[] = [
  { value: 'AUTO', label: 'Automatique' },
  { value: 'ROADBOOK', label: 'Roadbook officiel' },
  { value: 'TRACK', label: 'Trace GPX' },
];

/** Une ligne du formulaire : champs texte, convertis à l'envoi. */
interface Row {
  id: number;
  label: string;
  date: string;
  kind: ReferenceKind;
  km: string;
  gain: string;
  time: string;
}

let nextRowId = 0;
const toRow = (r: Reference): Row => ({
  id: nextRowId++,
  label: r.label,
  date: r.date ?? '',
  kind: r.kind,
  km: String(r.km),
  gain: String(r.gainM),
  time: formatHm(durationMinutes(r.time)),
});
/** Durées de préparation proposées : un plan d'entraînement dure de 10 à 16 semaines. */
const PREP_WEEKS = Array.from({ length: MAX_PREP_WEEKS - MIN_PREP_WEEKS + 1 }, (_, i) => MIN_PREP_WEEKS + i);

const isBlank = (r: Row) => !r.label.trim() && !r.km.trim() && !r.gain.trim() && !r.time.trim();
const emptyRow = (): Row => ({ id: nextRowId++, label: '', date: '', kind: 'RACE', km: '', gain: '', time: '' });

/** Ligne → référence pour l'API ; liste d'erreurs si la saisie est incomplète. */
function parseRow(row: Row): { ref: Reference | null; errors: Partial<Record<'km' | 'gain' | 'time', string>> } {
  const km = Number(row.km.replace(',', '.'));
  const gain = Number(row.gain.replace(/\s/g, ''));
  const time = parseHmInput(row.time);
  const errors: Partial<Record<'km' | 'gain' | 'time', string>> = {};
  if (!(km > 0)) errors.km = 'Distance > 0';
  if (row.gain.trim() === '' || !(gain >= 0)) errors.gain = 'D+ ≥ 0';
  if (time === null) errors.time = 'Format 8h48';
  if (Object.keys(errors).length) return { ref: null, errors };
  return { ref: { label: row.label.trim(), date: row.date || null, kind: row.kind, km, gainM: gain, time: time! }, errors };
}

export function ReferenceForm({ initialReferences, initialSource, loading, onSubmit, target, training, onTrainingChange }: Props) {
  const [rows, setRows] = useState<Row[]>(() => initialReferences.map(toRow));
  const [source, setSource] = useState<ElevationSource>(initialSource);
  // Repliées en un résumé une fois le plan calculé : on les rouvre pour les modifier.
  const [expanded, setExpanded] = useState(() => initialReferences.length === 0 || initialReferences.some((r) => !(r.km > 0)));
  const [advanced, setAdvanced] = useState(false);
  // Retour de la page d'autorisation de Strava (?strava=…) : on rouvre l'import là où on l'avait laissé,
  // puis on retire le paramètre de l'adresse (un rechargement ne doit pas rouvrir l'import).
  const [stravaResult, setStravaResult] = useState(() => new URLSearchParams(window.location.search).get('strava'));
  const [stravaOpen, setStravaOpen] = useState(stravaResult !== null);
  // Compte Strava connecté : on propose de tenir compte de l'entraînement.
  const [stravaConnected, setStravaConnected] = useState(false);
  useEffect(() => {
    if (stravaOpen) return;
    fetchStravaStatus().then((s) => setStravaConnected(s.connected)).catch(() => setStravaConnected(false));
  }, [stravaOpen]);
  useEffect(() => {
    if (stravaResult === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('strava');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [stravaResult]);

  const parsed = rows.map(parseRow);
  const valid = parsed.every((p) => p.ref !== null);

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Les sorties importées s'ajoutent aux références (à la place d'une ligne vide), et le plan est recalculé.
  function addImported(refs: Reference[]) {
    const next = [...rows.filter((r) => !isBlank(r)), ...refs.map(toRow)];
    setRows(next);
    setStravaOpen(false);
    setStravaResult(null);
    const all = next.map(parseRow);
    if (all.every((p) => p.ref !== null)) {
      onSubmit(all.map((p) => p.ref!), source);
      setExpanded(false);
    } else {
      setExpanded(true);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) {
      onSubmit(parsed.map((p) => p.ref!), source);
      setExpanded(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <div className="form-head">
        <h2>Tes références</h2>
        {valid && (
          <button type="button" className="link-btn" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            {expanded ? 'Fermer' : 'Modifier'}
          </button>
        )}
      </div>

      {!expanded && (
        <ul className="ref-summary">
          {parsed.map((p, i) => p.ref && (
            <li key={rows[i].id}>
              <span>{isExampleReference(p.ref) ? <span className="example-tag">Exemple</span> : p.ref.label.trim() || `Référence ${i + 1}`}</span>
              <span className="muted">{formatKm(p.ref.km)} km · {formatHm(durationMinutes(p.ref.time))}</span>
            </li>
          ))}
        </ul>
      )}
      {parsed.some((p) => p.ref && isExampleReference(p.ref)) && (
        <p className="example-note small">
          Référence d'exemple, pas la tienne : remplace-la par une course que tu as faite (ou importe-la depuis Strava)
          pour un plan à ton rythme.{' '}
          {!expanded && <button type="button" className="link-btn" onClick={() => setExpanded(true)}>Mettre la mienne</button>}
        </p>
      )}

      {expanded && <>
      <p className="muted small">
        Des courses ou sorties chronométrées, temps arrêts compris. Les plus récentes et les plus proches
        de ta course comptent davantage.
      </p>

      {rows.map((row, i) => {
        const errors = parsed[i].errors;
        return (
          <fieldset key={row.id} className="ref-card">
            <div className="ref-head">
              <input className="ref-label" value={row.label} onChange={(e) => update(row.id, { label: e.target.value })}
                placeholder={i === 0 ? 'Ex. : Trail des Cathares' : `Référence ${i + 1}`} aria-label="Nom" />
              {rows.length > 1 && (
                <button type="button" className="ghost icon-btn" aria-label={`Supprimer ${row.label || `la référence ${i + 1}`}`}
                  onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}>✕</button>
              )}
            </div>
            <div className="ref-grid">
              <label>
                <span>Date</span>
                <DatePicker value={row.date} onChange={(date) => update(row.id, { date })} clearable placeholder="Facultative"
                  ariaLabel="Date" />
              </label>
              <label>
                <span>Type</span>
                <select value={row.kind} onChange={(e) => update(row.id, { kind: e.target.value as ReferenceKind })}>
                  <option value="RACE">Course</option>
                  <option value="TRAINING">Entraînement</option>
                </select>
              </label>
            </div>
            <div className="ref-grid three">
              <label>
                <span>Km</span>
                <input inputMode="decimal" value={row.km} onChange={(e) => update(row.id, { km: e.target.value })} aria-invalid={!!errors.km} />
              </label>
              <label>
                <span>D+ (m)</span>
                <input inputMode="numeric" value={row.gain} onChange={(e) => update(row.id, { gain: e.target.value })} aria-invalid={!!errors.gain} />
              </label>
              <label>
                <span>Temps</span>
                <input value={row.time} onChange={(e) => update(row.id, { time: e.target.value })} placeholder="8h48" aria-invalid={!!errors.time} />
              </label>
            </div>
            {Object.keys(errors).length > 0 && (row.km || row.gain || row.time) && (
              <small className="field-error">{Object.values(errors).join(' · ')}</small>
            )}
          </fieldset>
        );
      })}

      <div className="ref-actions">
        <button type="button" className="ghost" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          + Ajouter une référence
        </button>
        <button type="button" className="strava-btn" onClick={() => setStravaOpen(true)}>
          <StravaLogo /> Importer depuis Strava
        </button>
      </div>
      <p className="muted small">
        Entraînement : sortie rarement courue à fond, comptée comme une course 10 % plus rapide, avec un poids réduit.
      </p>

      <button type="button" className="link-btn advanced-toggle" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
        {advanced ? 'Masquer les options avancées' : 'Options avancées'}
      </button>
      {advanced && (
      <div className="advanced-options">
      {stravaConnected && (
        <div className="training-options">
          <label className="check">
            <input type="checkbox" checked={training.strava}
              onChange={(e) => onTrainingChange({ ...training, strava: e.target.checked })} />
            Tenir compte de mon entraînement Strava
          </label>
          {training.strava && (
            <>
              <label className="check sub">
                <input type="checkbox" checked={training.includeHikes}
                  onChange={(e) => onTrainingChange({ ...training, includeHikes: e.target.checked })} />
                Compter les randonnées dans le volume
              </label>
              <label className="sub prep-weeks">
                <span>Ma préparation dure</span>
                <select value={training.weeks} onChange={(e) => onTrainingChange({ ...training, weeks: Number(e.target.value) })}>
                  {PREP_WEEKS.map((w) => <option key={w} value={w}>{w} semaines</option>)}
                </select>
              </label>
            </>
          )}
        </div>
      )}
      <label>
        <span>Dénivelé de la course</span>
        <select value={source} onChange={(e) => setSource(e.target.value as ElevationSource)}>
          {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      </div>
      )}

      <button type="submit" disabled={!valid || loading}>
        {loading ? 'Calcul…' : 'Calculer mon plan'}
      </button>
      </>}

      {stravaConnected && (
        <p className="strava-status muted small">
          <span className="strava-dot" aria-hidden />
          Strava connecté · préparation {training.strava ? 'prise en compte' : 'non prise en compte'}
        </p>
      )}

      {stravaOpen && (
        <StravaImport
          existing={parsed.flatMap((p) => (p.ref ? [p.ref] : []))}
          target={target}
          onAdd={addImported}
          onClose={() => { setStravaOpen(false); setStravaResult(null); }}
          connectionResult={stravaResult}
          training={training}
          onTrainingChange={onTrainingChange}
        />
      )}
    </form>
  );
}
