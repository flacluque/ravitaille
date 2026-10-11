import { useState, type FormEvent } from 'react';
import type { ElevationSource, Reference, ReferenceKind } from '../api/types';
import { durationMinutes, formatHm, parseHmInput } from '../lib/format';

interface Props {
  initialReferences: Reference[];
  initialSource: ElevationSource;
  loading: boolean;
  onSubmit: (references: Reference[], source: ElevationSource) => void;
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

export function ReferenceForm({ initialReferences, initialSource, loading, onSubmit }: Props) {
  const [rows, setRows] = useState<Row[]>(() => initialReferences.map(toRow));
  const [source, setSource] = useState<ElevationSource>(initialSource);

  const parsed = rows.map(parseRow);
  const valid = parsed.every((p) => p.ref !== null);

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) onSubmit(parsed.map((p) => p.ref!), source);
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>Tes références</h2>
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
                <input type="date" value={row.date} onChange={(e) => update(row.id, { date: e.target.value })} />
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

      <button type="button" className="ghost add-btn" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
        + Ajouter une référence
      </button>
      <p className="muted small">
        Entraînement : sortie rarement courue à fond, comptée comme une course 10 % plus rapide, avec un poids réduit.
      </p>

      <label>
        <span>Dénivelé de la course</span>
        <select value={source} onChange={(e) => setSource(e.target.value as ElevationSource)}>
          {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>

      <button type="submit" disabled={!valid || loading}>
        {loading ? 'Calcul…' : 'Calculer mon plan'}
      </button>
    </form>
  );
}
