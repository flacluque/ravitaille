import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, fetchCourse, fetchCustomPlans, fetchPlans, loadSnapshot, saveSnapshot, type Snapshot } from './api/client';
import {
  loadCrew, loadDraft, loadGear, loadGpx, loadNutrition, loadTrainingOptions, saveCrew, saveDraft, saveGpx, saveNutrition,
  saveTrainingOptions,
} from './api/storage';
import type { ElevationSource, Reference } from './api/types';
import { CompareTable } from './components/CompareTable';
import { CourseMap } from './components/CourseMap';
import { ElevationProfile } from './components/ElevationProfile';
import { Legend } from './components/Legend';
import { GearCard } from './components/GearCard';
import type { NutritionProfile } from './lib/nutrition';
import { PassageTable } from './components/PassageTable';
import { RaceEditor } from './components/RaceEditor';
import { ReferenceForm } from './components/ReferenceForm';
import { WelcomePage } from './components/WelcomePage';
import { ReferenceInsights } from './components/ReferenceInsights';
import { TrainingCard } from './components/TrainingCard';
import { AlgorithmPage } from './components/AlgorithmPage';
import { PlanHero } from './components/PlanHero';
import { RavitosView } from './components/RavitosView';
import { TrainingLine } from './components/TrainingLine';
import { ScenarioCards } from './components/ScenarioCards';
import { draftSignature, draftToRace, emptyDraft, type RaceDraft } from './lib/draft';
import { formatClock, formatKm, formatMeters } from './lib/format';
import { defaultServices } from './lib/services';

// Course d'exemple embarquée (src/main/resources/samples/bogomiles).
const SAMPLE_ID = 'bogomiles';
const CUSTOM_ID = 'custom';
type Tab = 'accueil' | 'plan' | 'ravitos' | 'sac' | 'analyse' | 'algo';
const TABS: [Tab, string][] = [['accueil', 'Accueil'], ['plan', 'Mon plan'], ['ravitos', 'Ravitos'], ['sac', 'Sac'],
  ['analyse', 'Analyse'], ['algo', 'Comment ça marche']];
const TAB_HASH: Record<Tab, string> = {
  accueil: '#accueil', plan: '#plan', ravitos: '#ravitos', sac: '#sac', analyse: '#analyse', algo: '#algorithme',
};
const WELCOME_SEEN = 'trail-planner:accueil-vu';

/** Onglet de départ : l'accueil à la première visite, ensuite le plan (sauf lien vers un onglet). */
function initialTab(): Tab {
  const fromHash = window.location.hash ? tabFromHash(window.location.hash) : null;
  if (fromHash) return fromHash;
  // Retour de la connexion Strava : la fenêtre d'import s'ouvre dans « Mon plan ».
  if (new URLSearchParams(window.location.search).has('strava')) return 'plan';
  try {
    return localStorage.getItem(WELCOME_SEEN) ? 'plan' : 'accueil';
  } catch {
    return 'accueil';
  }
}

/** Onglet d'une adresse ; null pour une ancre interne (#source-…) qui ne change pas d'onglet. */
function tabFromHash(hash: string): Tab | null {
  if (hash === '' || hash === '#') return 'plan';
  if (hash.startsWith('#algo')) return 'algo';
  const found = TABS.find(([id]) => TAB_HASH[id] === hash);
  return found ? found[0] : null;
}

const DEFAULT_REFERENCES: Reference[] = [{ label: '', date: null, kind: 'RACE', km: 60, gainM: 3200, time: 'PT8H48M' }];

type Mode = 'demo' | 'custom';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  /** Pas de réseau ou API arrêtée. */
  | { kind: 'unreachable'; error: string }
  /** L'API a répondu mais refuse le calcul (roadbook incohérent...). */
  | { kind: 'rejected'; error: string };

export function App({ feedbackUrl = null }: { feedbackUrl?: string | null } = {}) {
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
  // Saisie qui a donné le plan affiché : s'il ne correspond plus à la saisie, il est périmé.
  const [computedSignature, setComputedSignature] = useState<string | null>(null);

  // Dernière référence demandée : l'éditeur de course relance le calcul avec elle.
  const [references, setReferences] = useState<Reference[]>(initial?.references.length ? initial.references : DEFAULT_REFERENCES);
  const [source, setSource] = useState<ElevationSource>(initial?.source ?? 'AUTO');
  const hasData = useRef(initial !== null);
  // Onglet affiché, avec sa propre adresse (#ravitos, #algorithme…) pour pouvoir partager le lien.
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    if (tab !== 'accueil') return;
    try {
      localStorage.setItem(WELCOME_SEEN, '1');
    } catch {
      // Stockage indisponible : l'accueil reviendra à la prochaine visite.
    }
  }, [tab]);
  useEffect(() => {
    const onHash = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const goTab = (next: Tab) => { window.location.hash = TAB_HASH[next]; };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  // Tenir compte de l'entraînement Strava : lu au moment de chaque calcul.
  const [training, setTraining] = useState(loadTrainingOptions);
  const trainingRef = useRef(training);

  const run = useCallback(async (sampleId: string, load: () => Promise<Pick<Snapshot, 'course' | 'plans'>>,
    refs: Reference[], src: ElevationSource) => {
    setStatus({ kind: 'loading' });
    try {
      const { course, plans } = await load();
      const snapshot: Snapshot = { sampleId, references: refs, source: src, course, plans, savedAt: new Date().toISOString() };
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

  const computeDemo = useCallback((refs: Reference[], src: ElevationSource) =>
    run(SAMPLE_ID, async () => {
      const [course, plans] = await Promise.all([fetchCourse(SAMPLE_ID), fetchPlans(SAMPLE_ID, refs, src, trainingRef.current)]);
      return { course, plans };
    }, refs, src), [run]);

  const computeCustom = useCallback(async (refs: Reference[], src: ElevationSource, d: RaceDraft, file: File | null) => {
    const result = draftToRace(d, file !== null);
    if (!result.ok) {
      setDraftErrors(result.errors);
      setEditorOpen(true);
      return false;
    }
    setDraftErrors([]);
    const ok = await run(CUSTOM_ID, () => fetchCustomPlans(result.race, result.night, file, refs, src, trainingRef.current), refs, src);
    if (ok) setComputedSignature(draftSignature(d, file));
    return ok;
  }, [run]);

  function changeTraining(next: typeof training) {
    setTraining(next);
    trainingRef.current = next;
    saveTrainingOptions(next);
    void compute(references, source);
  }

  const compute = (refs: Reference[], src: ElevationSource) => {
    setReferences(refs);
    setSource(src);
    return mode === 'demo' ? computeDemo(refs, src) : computeCustom(refs, src, draft, gpx);
  };

  // Seul un calcul lancé depuis l'éditeur le referme : un calcul encore en cours au moment où
  // le coureur rouvre l'éditeur ne doit pas le lui fermer sous les doigts.
  async function submitEditor() {
    if (await computeCustom(references, source, draft, gpx)) setEditorOpen(false);
  }

  // Roadbook importé ou lu par l'IA : on recalcule aussitôt. La trace GPX d'une autre course ne
  // correspond plus, on la retire. Si la saisie est incomplète, on montre ce qui manque.
  async function loadedRoadbook(d: RaceDraft) {
    let file = gpx;
    const previous = data?.sampleId === CUSTOM_ID ? data.course.race.name : draft.name.trim();
    if (file && previous && d.name.trim() && d.name.trim() !== previous) {
      file = null;
      setGpx(null);
      void saveGpx(null);
    }
    if (!(await computeCustom(references, source, d, file))) {
      requestAnimationFrame(() => document.querySelector('.editor-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }

  // Premier chargement : on recalcule ce qui était affiché la dernière fois (la trace GPX est relue
  // depuis IndexedDB). Hors ligne, le dernier plan reste affiché.
  useEffect(() => {
    const refs = initial?.references.length ? initial.references : DEFAULT_REFERENCES;
    const src = initial?.source ?? 'AUTO';
    if (initial?.sampleId === CUSTOM_ID) {
      void loadGpx().then((file) => {
        setGpx(file);
        void computeCustom(refs, src, loadDraft() ?? emptyDraft(), file);
      });
    } else {
      void computeDemo(refs, src);
    }
  }, [initial, computeDemo, computeCustom]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setScenarioIndex(1);
    if (next === 'demo') {
      setEditorOpen(false);
      void computeDemo(references, source);
    } else {
      // Course déjà saisie : on calcule tout de suite ; sinon, place à la saisie (sans erreurs d'emblée).
      void loadGpx().then((file) => {
        setGpx(file);
        if (draftToRace(draft, file !== null).ok) void computeCustom(references, source, draft, file);
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
  const stale = mode === 'custom' && shown !== null && computedSignature !== null
    && computedSignature !== draftSignature(draft, gpx);
  // Saisie d'une autre course (nouveau roadbook pas encore calculable) : l'ancien plan n'a plus
  // rien à faire à l'écran, même grisé.
  const otherRace = stale && !!course && draft.name.trim() !== course.race.name;
  const draftName = draft.name.trim() || 'Ta nouvelle course';
  // Services de chaque point (déduits du type d'arrêt pour un plan gardé par une ancienne version).
  const services = useMemo(
    () => course?.race.checkpoints.map((c) => c.services ?? defaultServices(c.aid)) ?? [],
    [course],
  );

  // Profil nutrition : partagé par la nutrition et la checklist du matériel (eau obligatoire / flasques).
  const [nutritionProfile, setNutritionProfile] = useState<NutritionProfile>(loadNutrition);
  const changeNutritionProfile = (next: NutritionProfile) => {
    setNutritionProfile(next);
    saveNutrition(next);
  };

  // Points où l'assistance attend le coureur : gardés course par course.
  const crewRace = shown?.course.race.name ?? '';
  const [crew, setCrew] = useState<string[]>([]);
  useEffect(() => { setCrew(crewRace ? loadCrew(crewRace) : []); }, [crewRace]);
  const changeCrew = (codes: string[]) => {
    setCrew(codes);
    if (crewRace) saveCrew(crewRace, codes);
  };

  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfMenu, setPdfMenu] = useState(false);
  useEffect(() => {
    if (!pdfMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest('.pdf-menu')) setPdfMenu(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [pdfMenu]);

  async function savePdf(variant: 'summary' | 'full') {
    if (!course || plans.length === 0) return;
    setPdfMenu(false);
    setSavingPdf(true);
    try {
      const { downloadPlanPdf } = await import('./lib/pdf');
      await downloadPlanPdf({
        course, plans, selected: Math.min(scenarioIndex, plans.length - 1),
        services, nutrition: nutritionProfile, gear: loadGear(course.race.name), crew, variant,
      });
    } finally {
      setSavingPdf(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={TAB_HASH.accueil} aria-label="Trail Planner : accueil">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Trail Planner</span>
        </a>
        {tab === 'accueil' ? <div className="race-title" /> : otherRace ? (
          <div className="race-title">
            <h1>{draftName}</h1>
            <p>Plan à calculer</p>
          </div>
        ) : course && (
          <div className="race-title">
            <h1>{course.race.name}</h1>
            <p>
              Départ {formatClock(course.race.start)}
              {plan && <> · {formatKm(plan.totalDistanceKm)} km · {formatMeters(plan.totalGainM)} D+</>}
            </p>
          </div>
        )}
        {feedbackUrl && (
          <a className="feedback no-print" href={feedbackUrl} target="_blank" rel="noreferrer"
            title="Une idée, un bug, une remarque : dis-le-nous">
            💬 <span className="long">Donner mon avis</span>
          </a>
        )}
        <div className="pdf-menu no-print" hidden={tab === 'accueil'}>
          <button type="button" className="ghost" onClick={() => setPdfMenu((m) => !m)} disabled={!plan || savingPdf || stale}
            aria-expanded={pdfMenu} aria-haspopup="menu"
            title="Télécharger le plan de course en PDF (fonctionne aussi hors ligne)">
            {savingPdf ? 'PDF…' : 'Télécharger le PDF ▾'}
          </button>
          {pdfMenu && (
            <div className="pdf-menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => void savePdf('summary')}>
                <strong>Résumé · 1 page</strong>
                <span className="muted small">Passages, barrières et ravitos, à garder sur soi</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void savePdf('full')}>
                <strong>Complet</strong>
                <span className="muted small">Tout le plan : profil, références, préparation, nutrition, matériel</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="tabs no-print" aria-label="Pages">
        {TABS.map(([id, label]) => (
          <a key={id} href={TAB_HASH[id]} aria-current={tab === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>

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

      {tab === 'algo' && <AlgorithmPage plan={plan} />}
      {tab === 'accueil' && (
        <WelcomePage plan={plan} isExample={mode === 'demo'} feedbackUrl={feedbackUrl}
          onExample={() => { switchMode('demo'); goTab('plan'); }}
          onMyRace={() => { switchMode('custom'); goTab('plan'); }}
          onAlgorithm={() => goTab('algo')} />
      )}

      <main className="layout" hidden={tab === 'algo' || tab === 'accueil'}>
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
            initialReferences={references}
            initialSource={source}
            loading={status.kind === 'loading'}
            onSubmit={(refs, src) => void compute(refs, src)}
            target={plan && !otherRace ? { km: plan.totalDistanceKm, gainM: plan.totalGainM, date: course?.race.start?.slice(0, 10) ?? null } : null}
            training={training}
            onTrainingChange={changeTraining}
          />
          {plan && <SourceNote source={plan.elevationSource} hasTrack={!!course?.track} />}
        </aside>

        <section className="content">
          {tab !== 'plan' ? null : mode === 'custom' && (editorOpen || !shown) ? (
            <RaceEditor
              draft={draft}
              onChange={changeDraft}
              gpx={gpx}
              onGpxChange={changeGpx}
              errors={draftErrors}
              loading={status.kind === 'loading'}
              onSubmit={() => void submitEditor()}
              onCancel={shown ? () => setEditorOpen(false) : null}
              onLoaded={(d) => void loadedRoadbook(d)}
            />
          ) : mode === 'custom' && (
            <div className="editor-summary no-print">
              <span className="muted small">
                {gpx ? `Trace : ${gpx.name}` : 'Sans trace GPX : calcul sur le D+ du roadbook.'}
              </span>
              <button type="button" className="ghost" onClick={() => setEditorOpen(true)}>Modifier ma course</button>
            </div>
          )}

          {otherRace ? (
            <div className="banner warn stale-banner" role="status">
              Le plan de « {draftName} » n'est pas encore calculé :
              {' '}{draftErrors.length ? 'complète la saisie ci-dessus (voir les erreurs)' : 'clique sur « Calculer mon plan »'}.
            </div>
          ) : stale && course && (
            <div className="banner warn stale-banner" role="status">
              Le plan ci-dessous est celui de « {course.race.name} » avant tes changements :
              {' '}{draftErrors.length ? 'complète la saisie' : 'clique sur « Calculer mon plan »'} pour le mettre à jour.
            </div>
          )}

          {!otherRace && <div className={stale ? 'results stale' : 'results'} aria-hidden={stale || undefined}>
          {tab === 'plan' && <>
            {plans.length > 0 && <PlanHero plans={plans} selected={scenarioIndex} onSelect={setScenarioIndex} />}

            {plan?.training && <TrainingLine plan={plan} onDetails={() => goTab('analyse')} />}

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
              <PassageTable plan={plan} markers={course.markers} services={services} onHover={setHoverKm}
                onDetails={() => goTab('analyse')} />
            )}
          </>}

          {tab === 'ravitos' && plan && course && (
            <RavitosView plan={plan} services={services} profile={nutritionProfile} onProfileChange={changeNutritionProfile}
              crew={crew} onCrewChange={changeCrew} />
          )}

          {tab === 'sac' && course && <GearCard raceName={course.race.name} plan={plan} profile={nutritionProfile} />}

          {tab === 'analyse' && <>
            <p className="muted tab-intro">Tout ce qui sert au calcul, pour qui veut regarder de près.</p>
            {plans.length > 0 && <ScenarioCards plans={plans} selected={scenarioIndex} onSelect={setScenarioIndex} />}
            {plan && <ReferenceInsights plan={plan} />}
            {plan?.training && <TrainingCard plan={plan} />}
            {plan && course && <PassageTable plan={plan} markers={course.markers} services={services} onHover={setHoverKm} />}
            {plans.length > 1 && <CompareTable plans={plans} />}
          </>}

          {tab !== 'plan' && !plan && status.kind !== 'loading' && (
            <p className="muted">Calcule d'abord ton plan dans l'onglet « Mon plan ».</p>
          )}
          </div>}

          {status.kind === 'loading' && !shown && mode === 'demo' && <p className="muted">Calcul en cours…</p>}
        </section>
      </main>
      {(tab === 'plan' || tab === 'ravitos' || tab === 'analyse') && <Legend />}
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
