import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, fetchCourse, fetchCustomPlans, fetchPlans, loadSnapshot, saveSnapshot, type Snapshot } from './api/client';
import { loadDraft, loadGpx, saveDraft, saveGpx } from './api/storage';
import type { ElevationSource, Reference } from './api/types';
import { CompareTable } from './components/CompareTable';
import { CourseMap } from './components/CourseMap';
import { ElevationProfile } from './components/ElevationProfile';
import { PassageTable } from './components/PassageTable';
import { RaceEditor } from './components/RaceEditor';
import { ReferenceForm } from './components/ReferenceForm';
import { ScenarioCards } from './components/ScenarioCards';
import { draftToRace, emptyDraft, type RaceDraft } from './lib/draft';
import { formatClock, formatKm, formatMeters } from './lib/format';

// Course d'exemple embarquée (src/main/resources/samples/bogomiles).
const SAMPLE_ID = 'bogomiles';
const CUSTOM_ID = 'custom';
const DEFAULT_REFERENCE: Reference = { km: 60, gainM: 3200, time: 'PT8H48M' };

type Mode = 'demo' | 'custom';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  /** Pas de réseau ou API arrêtée. */
  | { kind: 'unreachable'; error: string }
  /** L'API a répondu mais refuse le calcul (roadbook incohérent...). */
  | { kind: 'rejected'; error: string };

export function App() {
  const initial = useMemo(loadSnapshot, []);
  const [data, setData] = useState<Snapshot | null>(initial);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [scenarioIndex, setScenarioIndex] = useState(1); // Réaliste
  const [hoverKm, setHoverKm] = useState<number | null>(null);

  const [mode, setMode] = useState<Mode>(initial?.sampleId === CUSTOM_ID ? 'custom' : 'demo');
  const [draft, setDraft] = useState<RaceDraft>(() => loadDraft() ?? emptyDraft());
  const [gpx, setGpx] = useState<File | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  // Dernière référence demandée : l'éditeur de course relance le calcul avec elle.
  const [reference, setReference] = useState<Reference>(initial?.reference ?? DEFAULT_REFERENCE);
  const [source, setSource] = useState<ElevationSource>(initial?.source ?? 'AUTO');
  const hasData = useRef(initial !== null);

  const run = useCallback(async (sampleId: string, load: () => Promise<Pick<Snapshot, 'course' | 'plans'>>,
    ref: Reference, src: ElevationSource) => {
    setStatus({ kind: 'loading' });
    try {
      const { course, plans } = await load();
      const snapshot: Snapshot = { sampleId, reference: ref, source: src, course, plans, savedAt: new Date().toISOString() };
      setData(snapshot);
      saveSnapshot(snapshot);
      hasData.current = true;
      setStatus({ kind: 'ready' });
      return true;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setStatus(e instanceof ApiError ? { kind: 'rejected', error } : { kind: 'unreachable', error });
      return false;
    }
  }, []);

  const computeDemo = useCallback((ref: Reference, src: ElevationSource) =>
    run(SAMPLE_ID, async () => {
      const [course, plans] = await Promise.all([fetchCourse(SAMPLE_ID), fetchPlans(SAMPLE_ID, ref, src)]);
      return { course, plans };
    }, ref, src), [run]);

  const computeCustom = useCallback(async (ref: Reference, src: ElevationSource, d: RaceDraft, file: File | null) => {
    const result = draftToRace(d, file !== null);
    if (!result.ok) {
      setDraftErrors(result.errors);
      setEditorOpen(true);
      return false;
    }
    setDraftErrors([]);
    return run(CUSTOM_ID, () => fetchCustomPlans(result.race, result.night, file, ref, src), ref, src);
  }, [run]);

  const compute = (ref: Reference, src: ElevationSource) => {
    setReference(ref);
    setSource(src);
    return mode === 'demo' ? computeDemo(ref, src) : computeCustom(ref, src, draft, gpx);
  };

  // Seul un calcul lancé depuis l'éditeur le referme : un calcul encore en cours au moment où
  // le coureur rouvre l'éditeur ne doit pas le lui fermer sous les doigts.
  async function submitEditor() {
    if (await computeCustom(reference, source, draft, gpx)) setEditorOpen(false);
  }

  // Premier chargement : on recalcule ce qui était affiché la dernière fois (la trace GPX est relue
  // depuis IndexedDB). Hors ligne, le dernier plan reste affiché.
  useEffect(() => {
    const ref = initial?.reference ?? DEFAULT_REFERENCE;
    const src = initial?.source ?? 'AUTO';
    if (initial?.sampleId === CUSTOM_ID) {
      void loadGpx().then((file) => {
        setGpx(file);
        void computeCustom(ref, src, loadDraft() ?? emptyDraft(), file);
      });
    } else {
      void computeDemo(ref, src);
    }
  }, [initial, computeDemo, computeCustom]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setScenarioIndex(1);
    if (next === 'demo') {
      setEditorOpen(false);
      void computeDemo(reference, source);
    } else {
      // Course déjà saisie : on calcule tout de suite ; sinon, place à la saisie (sans erreurs d'emblée).
      void loadGpx().then((file) => {
        setGpx(file);
        if (draftToRace(draft, file !== null).ok) void computeCustom(reference, source, draft, file);
        else setEditorOpen(true);
      });
    }
  }

  // Une fois des erreurs affichées, elles suivent la saisie : chaque correction en fait disparaître une.
  function revalidate(d: RaceDraft, file: File | null) {
    if (draftErrors.length === 0) return;
    const result = draftToRace(d, file !== null);
    setDraftErrors(result.ok ? [] : result.errors);
  }

  function changeDraft(next: RaceDraft) {
    setDraft(next);
    saveDraft(next);
    revalidate(next, gpx);
  }

  function changeGpx(file: File | null) {
    setGpx(file);
    void saveGpx(file);
    revalidate(draft, file);
  }

  // En mode "ma course", on n'affiche pas le plan de l'exemple (et inversement).
  const shown = data && (data.sampleId === CUSTOM_ID) === (mode === 'custom') ? data : null;
  const plans = shown?.plans ?? [];
  const plan = plans[Math.min(scenarioIndex, plans.length - 1)];
  const course = shown?.course;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Trail Planner</span>
        </div>
        {course && (
          <div className="race-title">
            <h1>{course.race.name}</h1>
            <p>
              Départ {formatClock(course.race.start)}
              {plan && <> · {formatKm(plan.totalDistanceKm)} km · {formatMeters(plan.totalGainM)} D+</>}
            </p>
          </div>
        )}
        <button type="button" className="ghost no-print" onClick={() => window.print()} disabled={!plan}>
          Imprimer
        </button>
      </header>

      {status.kind === 'unreachable' && hasData.current && (
        <div className="banner warn no-print" role="status">
          Hors ligne : affichage du dernier plan calculé
          {data && <> (le {new Date(data.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})</>}.
        </div>
      )}
      {status.kind === 'unreachable' && !hasData.current && (
        <div className="banner error" role="alert">
          Impossible de joindre l'API : {status.error}. Vérifie que <code>mvn spring-boot:run</code> tourne.
        </div>
      )}
      {status.kind === 'rejected' && (
        <div className="banner error" role="alert">Calcul impossible : {status.error}</div>
      )}

      <main className="layout">
        <aside className="side no-print">
          <div className="card mode-switch" role="radiogroup" aria-label="Course">
            <button type="button" role="radio" aria-checked={mode === 'demo'} className={mode === 'demo' ? 'active' : ''}
              onClick={() => switchMode('demo')}>
              Exemple
            </button>
            <button type="button" role="radio" aria-checked={mode === 'custom'} className={mode === 'custom' ? 'active' : ''}
              onClick={() => switchMode('custom')}>
              Ma course
            </button>
          </div>
          <ReferenceForm
            initialReference={reference}
            initialSource={source}
            loading={status.kind === 'loading'}
            onSubmit={(ref, src) => void compute(ref, src)}
          />
          {plan && <SourceNote source={plan.elevationSource} hasTrack={!!course?.track} />}
        </aside>

        <section className="content">
          {mode === 'custom' && (editorOpen || !shown) ? (
            <RaceEditor
              draft={draft}
              onChange={changeDraft}
              gpx={gpx}
              onGpxChange={changeGpx}
              errors={draftErrors}
              loading={status.kind === 'loading'}
              onSubmit={() => void submitEditor()}
              onCancel={shown ? () => setEditorOpen(false) : null}
            />
          ) : mode === 'custom' && (
            <div className="editor-summary no-print">
              <span className="muted small">
                {gpx ? `Trace : ${gpx.name}` : 'Sans trace GPX : calcul sur le D+ du roadbook.'}
              </span>
              <button type="button" className="ghost" onClick={() => setEditorOpen(true)}>Modifier ma course</button>
            </div>
          )}

          {plans.length > 0 && (
            <ScenarioCards plans={plans} selected={scenarioIndex} onSelect={setScenarioIndex} />
          )}

          {plan?.warnings.length ? (
            <ul className="warnings">
              {plan.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          ) : null}

          {course?.track && plan && (
            <div className="card course-visuals">
              <div className="map-wrap no-print">
                <CourseMap track={course.track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={setHoverKm} />
              </div>
              <ElevationProfile track={course.track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={setHoverKm} />
            </div>
          )}

          {plan && course && (
            <PassageTable plan={plan} markers={course.markers} onHover={setHoverKm} />
          )}

          {plans.length > 1 && <CompareTable plans={plans} />}

          {status.kind === 'loading' && !shown && mode === 'demo' && <p className="muted">Calcul en cours…</p>}
        </section>
      </main>
    </div>
  );
}

function SourceNote({ source, hasTrack }: { source: ElevationSource; hasTrack: boolean }) {
  return (
    <p className="note">
      {source === 'ROADBOOK'
        ? 'Distances et D+ : roadbook officiel.' + (hasTrack ? ' La trace GPX sert à la carte et au profil.' : '')
        : 'Distances et D+ : mesurés sur la trace GPX.'}
    </p>
  );
}
