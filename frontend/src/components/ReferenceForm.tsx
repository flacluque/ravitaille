import { useState, type FormEvent } from 'react';
import type { ElevationSource, Reference } from '../api/types';
import { durationMinutes, formatHm, parseHmInput } from '../lib/format';

interface Props {
  initialReference: Reference;
  initialSource: ElevationSource;
  loading: boolean;
  onSubmit: (reference: Reference, source: ElevationSource) => void;
}

const SOURCES: { value: ElevationSource; label: string }[] = [
  { value: 'AUTO', label: 'Automatique' },
  { value: 'ROADBOOK', label: 'Roadbook officiel' },
  { value: 'TRACK', label: 'Trace GPX' },
];

export function ReferenceForm({ initialReference, initialSource, loading, onSubmit }: Props) {
  const [km, setKm] = useState(String(initialReference.km));
  const [gain, setGain] = useState(String(initialReference.gainM));
  const [time, setTime] = useState(formatHm(durationMinutes(initialReference.time)));
  const [source, setSource] = useState<ElevationSource>(initialSource);

  const kmValue = Number(km.replace(',', '.'));
  const gainValue = Number(gain);
  const timeIso = parseHmInput(time);
  const errors = {
    km: !(kmValue > 0) ? 'Distance > 0' : null,
    gain: !(gainValue >= 0) || gain.trim() === '' ? 'D+ ≥ 0' : null,
    time: timeIso === null ? 'Format 8h48' : null,
  };
  const valid = !errors.km && !errors.gain && !errors.time;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid && timeIso) onSubmit({ km: kmValue, gainM: gainValue, time: timeIso }, source);
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>Ta course de référence</h2>
      <p className="muted small">Une course récente, bouclée au mieux de ta forme. Le temps inclut les arrêts.</p>

      <label>
        <span>Distance</span>
        <span className="input-unit">
          <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} aria-invalid={!!errors.km} />
          <em>km</em>
        </span>
        {errors.km && <small className="field-error">{errors.km}</small>}
      </label>

      <label>
        <span>Dénivelé positif</span>
        <span className="input-unit">
          <input inputMode="numeric" value={gain} onChange={(e) => setGain(e.target.value)} aria-invalid={!!errors.gain} />
          <em>m D+</em>
        </span>
        {errors.gain && <small className="field-error">{errors.gain}</small>}
      </label>

      <label>
        <span>Temps final</span>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="8h48" aria-invalid={!!errors.time} />
        {errors.time && <small className="field-error">{errors.time}</small>}
      </label>

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
