import { DatePicker } from './DatePicker';
import { todayIso } from '../lib/dates';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { extractRoadbook, fetchExtractorStatus } from '../api/client';
import type { AidLevel, ExtractorStatus } from '../api/types';
import {
  draftToFile,
  emptyCheckpoint,
  extractedToDraft,
  hasContent,
  parseRoadbookFile,
  resolveCutoffs,
  draftFieldErrors,
  type DraftCheckpoint,
  type RaceDraft,
} from '../lib/draft';
import { formatClock } from '../lib/format';
import { ConfirmBar } from './ConfirmBar';
import { aidFor, SERVICE_INFO, SERVICES, sortServices } from '../lib/services';

interface Props {
  draft: RaceDraft;
  onChange: (draft: RaceDraft) => void;
  gpx: File | null;
  onGpxChange: (file: File | null) => void;
  errors: string[];
  loading: boolean;
  onSubmit: () => void;
  onCancel: (() => void) | null;
  /** Un roadbook vient d'être importé ou lu : l'appli recalcule aussitôt le plan s'il est complet. */
  onLoaded: (draft: RaceDraft) => void;
}

const AIDS: { value: AidLevel; label: string }[] = [
  { value: 'NONE', label: 'Pointage' },
  { value: 'LIGHT', label: 'Ravito' },
  { value: 'FULL', label: 'Base de vie' },
];

/** Saisie du roadbook (à partir du PDF / de l'image de l'organisation) et choix de la trace GPX. */
export function RaceEditor({ draft, onChange, gpx, onGpxChange, errors, loading, onSubmit, onCancel, onLoaded }: Props) {
  const roadbookInput = useRef<HTMLInputElement>(null);
  const gpxInput = useRef<HTMLInputElement>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const scan = useRoadbookScan();
  // Fichier choisi alors que l'éditeur contient déjà une course : on demande avant d'écraser.
  const [pendingScan, setPendingScan] = useState<File | null>(null);
  const resolved = resolveCutoffs(draft);
  const exported = draftToFile(draft);
  // Erreurs affichées à côté du champ dès qu'on l'a quitté, ou toutes après un essai de calcul.
  const fields = draftFieldErrors(draft, gpx !== null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  const err = (key: string) => (touched.has(key) || errors.length > 0 ? fields[key] : undefined);
  // Brouillon vide : on propose d'abord de lire le roadbook, la saisie à la main en second.
  const [manual, setManual] = useState(false);
  const aiAvailable = scan.status?.enabled !== false;
  const empty = aiAvailable && !manual && !hasContent(draft) && !scan.reading && !scan.preview && !pendingScan;

  const set = (patch: Partial<RaceDraft>) => onChange({ ...draft, ...patch });
  const setCp = (id: string, patch: Partial<DraftCheckpoint>) =>
    set({ checkpoints: draft.checkpoints.map((cp) => (cp.id === id ? { ...cp, ...patch } : cp)) });
  const removeCp = (id: string) => set({ checkpoints: draft.checkpoints.filter((cp) => cp.id !== id) });
  // Un nouveau point s'insère avant l'arrivée : on saisit le roadbook dans l'ordre.
  const addCp = () => {
    const cps = draft.checkpoints;
    const at = Math.max(1, cps.length - 1);
    set({ checkpoints: [...cps.slice(0, at), emptyCheckpoint(), ...cps.slice(at)] });
  };

  async function importRoadbook(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = parseRoadbookFile(await file.text());
      onChange(imported);
      onLoaded(imported);
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  function exportRoadbook() {
    if (!exported) return;
    const url = URL.createObjectURL(new Blob([exported], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(draft.name) || 'roadbook'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function chooseScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (hasContent(draft)) setPendingScan(file);
    else void scanRoadbook(file);
  }

  async function scanRoadbook(file: File) {
    setPendingScan(null);
    const extracted = await scan.read(file);
    if (extracted) {
      const { draft: next, warnings } = extractedToDraft(extracted, draft, file.name);
      scan.setWarnings(warnings);
      onChange(next);
      onLoaded(next);
    }
  }

  function chooseGpx(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onGpxChange(file);
  }

  return (
    <section className="card editor">
      <div className="editor-head">
        <div>
          <h2>Ma course</h2>
          <p className="muted small">Recopie le roadbook de l'organisation : un point par ravito ou pointage, avec le km et le D+ cumulés.</p>
        </div>
        <div className="editor-actions" hidden={empty}>
          {aiAvailable && (
            <button type="button" onClick={() => scanInput.current?.click()} disabled={scan.reading}
              title="Une IA lit l'image ou le PDF du roadbook et remplit le tableau ; tu n'as plus qu'à vérifier">
              Lire un roadbook (image / PDF)
            </button>
          )}
          <input ref={scanInput} type="file" accept="image/*,.pdf,application/pdf" hidden onChange={chooseScan} />
          <button type="button" className="ghost" onClick={() => roadbookInput.current?.click()}
            title="Recharger un roadbook exporté en JSON">Importer</button>
          <button type="button" className="ghost" onClick={exportRoadbook} disabled={!exported}
            title={exported ? 'Télécharger le roadbook en JSON, pour le garder ou le partager' : 'Complète la saisie pour pouvoir exporter'}>
            Exporter
          </button>
          <input ref={roadbookInput} type="file" accept=".json,application/json" hidden onChange={importRoadbook} />
        </div>
      </div>
      {importError && <p className="field-error">{importError}</p>}
      {pendingScan && (
        <ConfirmBar
          message={`Remplacer « ${draft.name.trim() || 'la saisie actuelle'} » par la lecture de ${pendingScan.name} ?`}
          confirmLabel="Lire et remplacer"
          onConfirm={() => void scanRoadbook(pendingScan)}
          onCancel={() => setPendingScan(null)}
        />
      )}
      <ScanPanel scan={scan} onRetryStatus={scan.refreshStatus} />

      {empty ? (
        <div className="editor-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden>
            <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" />
          </svg>
          <h3>Commence par le roadbook de ta course</h3>
          <p>Prends-le en photo ou choisis son PDF : l'IA recopie les points, les km, le D+ et les barrières. Tu n'as plus qu'à
            relire.</p>
          <button type="button" className="editor-empty-cta" onClick={() => scanInput.current?.click()}>Lire un roadbook (photo ou PDF)</button>
          <p className="small">
            <button type="button" className="link-btn" onClick={() => setManual(true)}>Saisir à la main</button>
            {' · '}
            <button type="button" className="link-btn" onClick={() => roadbookInput.current?.click()}>Importer un fichier .json</button>
          </p>
        </div>
      ) : <>
      <div className="editor-fields">
        <label className="grow">
          <span>Nom de la course <Req /></span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => touch('name')}
            placeholder="Trail des Troubadours" aria-invalid={!!err('name')} aria-describedby={err('name') ? 'err-name' : undefined} />
          <FieldError id="err-name" message={err('name')} />
        </label>
        <div className="field" onBlur={() => touch('start')}>
          <span>Départ <Req /></span>
          <span className="date-time">
            <DatePicker value={draft.start.slice(0, 10)} ariaLabel="Date du départ"
              onChange={(date) => set({ start: `${date}T${draft.start.slice(11, 16) || '08:00'}` })} />
            <input type="time" value={draft.start.slice(11, 16)} aria-label="Heure du départ"
              onChange={(e) => set({ start: `${draft.start.slice(0, 10) || todayIso()}T${e.target.value}` })} />
          </span>
          <FieldError id="err-start" message={err('start')} />
        </div>
        <label className="narrow">
          <span>Nuit de</span>
          <input value={draft.nightStart} onChange={(e) => set({ nightStart: e.target.value })} placeholder="19h00" />
        </label>
        <label className="narrow">
          <span>à</span>
          <input value={draft.nightEnd} onChange={(e) => set({ nightEnd: e.target.value })} onBlur={() => touch('night')}
            placeholder="7h45" aria-invalid={!!err('night')} />
        </label>
        <FieldError id="err-night" message={err('night')} />
      </div>
      <p className="muted small required-note"><Req /> obligatoire{gpx ? '' : ' (le D+ aussi, tant qu\'il n\'y a pas de trace GPX)'}</p>

      <div className="gpx-row">
        <span className="gpx-label">Trace GPX</span>
        {gpx ? (
          <>
            <span className="gpx-file">{gpx.name} <span className="muted">({formatSize(gpx.size)})</span></span>
            <button type="button" className="ghost small-btn" onClick={() => gpxInput.current?.click()}>Changer</button>
            <button type="button" className="ghost small-btn" onClick={() => onGpxChange(null)}>Retirer</button>
          </>
        ) : (
          <>
            <button type="button" className="ghost small-btn" onClick={() => gpxInput.current?.click()}>Choisir un fichier .gpx</button>
            <span className="muted small">Facultatif. Sans trace : pas de carte ni de profil, et le D+ du roadbook est obligatoire partout.</span>
          </>
        )}
        <input ref={gpxInput} type="file" accept=".gpx,application/gpx+xml" hidden onChange={chooseGpx} />
      </div>

      <p className="muted small cp-help">
        Type de point : <strong>pointage</strong> = contrôle de passage sans ravitaillement, <strong>ravito</strong> = eau et
        de quoi manger, <strong>base de vie</strong> = repas chaud, souvent le sac de délestage.
      </p>
      <div className="cp-grid" role="table" aria-label="Points du roadbook">
        <div className="cp-row cp-header" role="row">
          <span role="columnheader">Code</span>
          <span role="columnheader">Lieu</span>
          <span role="columnheader">Km <Req /></span>
          <span role="columnheader">D+ cumulé {!gpx && <Req />}</span>
          <span role="columnheader">D- cumulé</span>
          <span role="columnheader">Type</span>
          <span role="columnheader">Barrière entrée</span>
          <span role="columnheader">Barrière sortie</span>
          <span />
        </div>
        {draft.checkpoints.map((cp, i) => {
          const isStart = i === 0;
          return (
            <div className="cp-row" role="row" key={cp.id}>
              <Cell label="Code"><input value={cp.code} onChange={(e) => setCp(cp.id, { code: e.target.value })} placeholder={String(i + 1)}
                aria-invalid={!!err(`${cp.id}.code`)} onBlur={() => touch(`${cp.id}.code`)} /><FieldError id={`err-${cp.id}-code`} message={err(`${cp.id}.code`)} /></Cell>
              <Cell label="Lieu" className="cp-name"><input value={cp.name} onChange={(e) => setCp(cp.id, { name: e.target.value })} placeholder="Lieu" /></Cell>
              <Cell label="Km"><input inputMode="decimal" value={cp.km} onChange={(e) => setCp(cp.id, { km: e.target.value })}
                aria-invalid={!!err(`${cp.id}.km`)} aria-required onBlur={() => touch(`${cp.id}.km`)} /><FieldError id={`err-${cp.id}-km`} message={err(`${cp.id}.km`)} /></Cell>
              <Cell label="D+"><input inputMode="numeric" value={cp.gainM} onChange={(e) => setCp(cp.id, { gainM: e.target.value })} placeholder={isStart ? '0' : ''}
                aria-invalid={!!err(`${cp.id}.gainM`)} aria-required={!gpx} onBlur={() => touch(`${cp.id}.gainM`)} /><FieldError id={`err-${cp.id}-gain`} message={err(`${cp.id}.gainM`)} /></Cell>
              <Cell label="D-"><input inputMode="numeric" value={cp.lossM} onChange={(e) => setCp(cp.id, { lossM: e.target.value })} placeholder={isStart ? '0' : 'facultatif'}
                aria-invalid={!!err(`${cp.id}.lossM`)} onBlur={() => touch(`${cp.id}.lossM`)} /><FieldError id={`err-${cp.id}-loss`} message={err(`${cp.id}.lossM`)} /></Cell>
              <Cell label="Type">
                <select value={cp.aid} onChange={(e) => setCp(cp.id, { aid: e.target.value as AidLevel })}>
                  {AIDS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </Cell>
              <Cell label="Barrière entrée">
                <input value={cp.cutoffIn} onChange={(e) => setCp(cp.id, { cutoffIn: e.target.value })} placeholder={isStart ? '' : '14h30'} disabled={isStart}
                  aria-invalid={!!err(`${cp.id}.cutoffIn`)} onBlur={() => touch(`${cp.id}.cutoffIn`)} />
                <FieldError id={`err-${cp.id}-in`} message={err(`${cp.id}.cutoffIn`)} />
                {resolved[i].cutoffIn && <small className="muted">{formatClock(resolved[i].cutoffIn!)}</small>}
              </Cell>
              <Cell label="Barrière sortie">
                <input value={cp.cutoffOut} onChange={(e) => setCp(cp.id, { cutoffOut: e.target.value })} disabled={isStart}
                  aria-invalid={!!err(`${cp.id}.cutoffOut`)} onBlur={() => touch(`${cp.id}.cutoffOut`)} />
                <FieldError id={`err-${cp.id}-out`} message={err(`${cp.id}.cutoffOut`)} />
                {resolved[i].cutoffOut && <small className="muted">{formatClock(resolved[i].cutoffOut!)}</small>}
              </Cell>
              <span className="cp-remove">
                {!isStart && draft.checkpoints.length > 2 && (
                  <button type="button" className="ghost icon-btn" onClick={() => removeCp(cp.id)} aria-label={`Supprimer ${cp.name || `le point ${i + 1}`}`}>✕</button>
                )}
              </span>
              <div className="cp-services" role="group" aria-label={`Services à ${cp.name || `point ${i + 1}`}`}>
                {SERVICES.map((service) => {
                  const on = cp.services.includes(service);
                  return (
                    <button key={service} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
                      title={SERVICE_INFO[service].label}
                      onClick={() => {
                        const services = sortServices(on ? cp.services.filter((x) => x !== service) : [...cp.services, service]);
                        // Le type d'arrêt suit les services (repas chaud = base de vie) ; il reste modifiable à la main.
                        setCp(cp.id, { services, aid: i === 0 || i === draft.checkpoints.length - 1 ? cp.aid : aidFor(services) });
                      }}>
                      <span aria-hidden>{SERVICE_INFO[service].icon}</span> {SERVICE_INFO[service].short}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="ghost add-btn" onClick={addCp}>+ Ajouter un point</button>

      {errors.length > 0 && (
        <ul className="editor-errors" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="editor-footer">
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Fermer</button>}
        <button type="button" onClick={onSubmit} disabled={loading}>{loading ? 'Calcul…' : 'Calculer mon plan'}</button>
      </div>
      </>}
    </section>
  );
}

/** Lecture du roadbook par l'IA : état du service, lecture en cours, image d'origine, points à vérifier. */
function useRoadbookScan() {
  const [status, setStatus] = useState<ExtractorStatus | null>(null);
  const [reading, setReading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ url: string; pdf: boolean; name: string } | null>(null);

  const refreshStatus = () => {
    fetchExtractorStatus().then(setStatus).catch(() => setStatus(null));
  };
  useEffect(refreshStatus, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    if (!reading) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [reading]);

  async function read(file: File) {
    setReading(true);
    setError(null);
    setWarnings([]);
    setPreview({ url: URL.createObjectURL(file), pdf: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'), name: file.name });
    try {
      return await extractRoadbook(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      refreshStatus();
      return null;
    } finally {
      setReading(false);
    }
  }

  return { status, reading, elapsed, error, warnings, setWarnings, preview, read, refreshStatus };
}

function ScanPanel({ scan, onRetryStatus }: { scan: ReturnType<typeof useRoadbookScan>; onRetryStatus: () => void }) {
  const { status, reading, elapsed, error, warnings, preview } = scan;
  const notReady = status?.enabled && !status.ready && !reading && !preview;
  if (!reading && !error && !preview && !notReady) return null;
  return (
    <div className="scan">
      {notReady && (
        <p className="scan-hint">
          Lecture automatique pas encore prête : {status?.message}{' '}
          <button type="button" className="link-btn" onClick={onRetryStatus}>Revérifier</button>
        </p>
      )}
      {reading && (
        <p className="scan-progress" role="status">
          <span className="spinner" aria-hidden /> Lecture du roadbook par {status?.model ?? "l'IA"}… {elapsed} s
          <span className="muted small"> (de 30 s à 2 min selon le modèle et la machine)</span>
        </p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      {!reading && !error && preview && (
        <div className="scan-check" role="note">
          <strong>Vérifie chaque ligne avec le roadbook ci-dessous</strong>, en particulier les barrières horaires :
          l'IA peut se tromper.
          {warnings.length > 0 && <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
      {preview && (
        <details className="scan-preview" open>
          <summary>Roadbook d'origine : {preview.name}</summary>
          {preview.pdf
            ? <object data={preview.url} type="application/pdf" aria-label={preview.name} />
            : <a href={preview.url} target="_blank" rel="noreferrer" title="Ouvrir en grand"><img src={preview.url} alt={`Roadbook ${preview.name}`} /></a>}
        </details>
      )}
    </div>
  );
}

/** Marque d'un champ obligatoire. */
function Req() {
  return <span className="req" aria-label="obligatoire" title="obligatoire">*</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <small id={id} className="field-error">{message}</small> : null;
}

function Cell({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`cp-cell ${className ?? ''}`} role="cell">
      <span className="cp-cell-label">{label}</span>
      {children}
    </label>
  );
}

function formatSize(bytes: number): string {
  return bytes > 1e6 ? `${(bytes / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : `${Math.ceil(bytes / 1e3)} ko`;
}

function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
