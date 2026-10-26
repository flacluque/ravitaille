import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, fetchCourse, fetchCustomPlans, fetchPlans, loadSnapshot, saveSnapshot, type Snapshot } from './api/client';
import {
  loadCrew, loadDraft, loadGear, loadGpx, loadNutrition, loadTrainingOptions, saveCrew, saveDraft, saveGpx, saveNutrition,
  saveTrainingOptions,
  loadFix, loadRunnerName, loadRunnerProfile, saveRunnerProfile, type StoredRunnerProfile,
} from './api/storage';
import type { ElevationSource, Reference } from './api/types';
import { CompareTable } from './components/CompareTable';
import { CourseMap } from './components/CourseMap';
import { PlacementEditor } from './components/PlacementEditor';
import { RunnerProfileCard } from './components/RunnerProfileCard';
import { ElevationProfile } from './components/ElevationProfile';
import { Legend } from './components/Legend';
import { GearCard } from './components/GearCard';
import type { NutritionProfile } from './lib/nutrition';
import { PassageTable } from './components/PassageTable';
import { RaceEditor } from './components/RaceEditor';
import { ReferenceForm } from './components/ReferenceForm';
import { WelcomePage } from './components/WelcomePage';
import { MobileNav } from './components/MobileNav';
import { RaceView } from './components/RaceView';
import { isRaceWindow, nowMinutes, type Fix } from './lib/race';
import { shareWithCrew, type ShareResult } from './lib/crewShare';
import { ReferenceInsights } from './components/ReferenceInsights';
import { TrainingCard } from './components/TrainingCard';
import { AlgorithmPage } from './components/AlgorithmPage';
import { PlanHero } from './components/PlanHero';
import { Roadbook } from './components/Roadbook';
import { GarminExport } from './components/GarminExport';
import { RavitosView } from './components/RavitosView';
import { TrainingLine } from './components/TrainingLine';
import { draftSignature, draftToRace, emptyDraft, withoutTrackPositions, withTrackPositions, type RaceDraft } from './lib/draft';
import { placementWarnings } from './lib/placement';
import { formatClock, formatKm, formatMeters } from './lib/format';
import { defaultServices } from './lib/services';

// Course d'exemple embarquée (src/main/resources/samples/bogomiles).
const SAMPLE_ID = 'bogomiles';
const CUSTOM_ID = 'custom';
type Tab = 'accueil' | 'plan' | 'course' | 'ravitos' | 'sac' | 'analyse' | 'algo';
const TABS: [Tab, string][] = [['accueil', 'Accueil'], ['plan', 'Mon plan'], ['course', 'En course'], ['ravitos', 'Ravitos'],
  ['sac', 'Sac'], ['analyse', 'Analyse'], ['algo', 'Comment ça marche']];
const TAB_HASH: Record<Tab, string> = {
  accueil: '#accueil', plan: '#plan', course: '#course', ravitos: '#ravitos', sac: '#sac', analyse: '#analyse', algo: '#algorithme',
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
  // Sur petit écran, la carte se replie sous le profil : on ne la charge qu'à la demande.
  const [mapOpen, setMapOpen] = useState(false);
  const narrow = useMediaQuery('(max-width: 1100px)');
  const showMap = !narrow || mapOpen;

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
  // Le jour de la course, l'appli s'ouvre sur « En course » (sauf lien vers un autre onglet).
  const [tab, setTab] = useState<Tab>(() => {
    const plan = initial?.plans[Math.min(1, initial.plans.length - 1)];
    const hashless = !window.location.hash && !new URLSearchParams(window.location.search).has('strava');
    return hashless && plan && isRaceWindow(plan, nowMinutes()) ? 'course' : initialTab();
  });
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
  // Profil personnel (pente et fatigue, mesuré sur Strava) : envoyé avec chaque calcul de sa course s'il l'utilise.
  const [runner, setRunner] = useState<StoredRunnerProfile>(loadRunnerProfile);
  const runnerRef = useRef(runner);

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
    const ok = await run(CUSTOM_ID, () => fetchCustomPlans(result.race, result.night, file, refs, src, trainingRef.current,
      runnerRef.current.use ? runnerRef.current.profile : null), refs, src);
    if (ok) setComputedSignature(draftSignature(d, file));
    return ok;
  }, [run]);

  function changeRunner(next: StoredRunnerProfile) {
    const applied = (r: StoredRunnerProfile) => (r.use ? r.profile : null);
    const changed = JSON.stringify(applied(next)) !== JSON.stringify(applied(runnerRef.current));
    setRunner(next);
    runnerRef.current = next;
    saveRunnerProfile(next);
    if (changed && mode === 'custom') void compute(references, source);
  }

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
    // Les ravitos placés à la main l'étaient sur l'ancienne trace.
    const next = withoutTrackPositions(draft);
    if (next !== draft) {
      setDraft(next);
      saveDraft(next);
    }
    revalidate(next, file);
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
  // Ravitos à placer sur la trace : seulement pour sa course, avec une trace, et un plan à jour de la saisie
  // (les points de la course calculée sont alors ceux du brouillon, dans le même ordre).
  const canPlace = mode === 'custom' && !!course?.track && !stale && !otherRace;
  const [placing, setPlacing] = useState(false);
  const [savingPlaces, setSavingPlaces] = useState(false);
  const toPlace = useMemo(() => (canPlace && course ? placementWarnings(course) : []), [canPlace, course]);
  useEffect(() => { if (!canPlace) setPlacing(false); }, [canPlace]);
  async function savePlaces(positions: (number | null)[]) {
    const next = withTrackPositions(draft, positions);
    changeDraft(next);
    setSavingPlaces(true);
    try {
      if (await computeCustom(references, source, next, gpx)) setPlacing(false);
    } finally {
      setSavingPlaces(false);
    }
  }
  function openPlacing() {
    setPlacing(true);
    requestAnimationFrame(() => document.querySelector('.placement')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
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

  // Lien de suivi pour l'assistance : le plan (les trois scénarios) voyage dans le lien.
  const shareCrew = (fix: Fix | null, runner: string | null, update?: string): Promise<ShareResult> =>
    !course ? Promise.resolve('failed')
      : shareWithCrew({ plans, likely: Math.min(1, plans.length - 1), course, services, profile: nutritionProfile, crew, fix,
        runner: runner ?? loadRunnerName(), update });

  const [savingPdf, setSavingPdf] = useState(false);
  // Pourquoi le PDF n'est pas disponible, dit au coureur plutôt qu'un bouton grisé muet.
  const pdfBlocked = !plan
    ? "Le PDF se télécharge une fois le plan calculé : complète ta course et clique sur « Calculer mon plan »."
    : stale ? "Ta course a changé depuis le dernier calcul : clique sur « Calculer mon plan » pour un PDF à jour." : null;
  const [pdfMenu, setPdfMenu] = useState(false);
  const [garminOpen, setGarminOpen] = useState(false);
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

  // Références : seulement dans Mon plan, à droite du roadbook (en haut sur mobile).
  const side = (
    <>
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
      {plan?.runner && (
        <p className="note">Pente et fatigue : ton profil de coureur ({plan.runner.activities} sortie{plan.runner.activities > 1 ? 's' : ''} Strava),
          {' '}<a href={TAB_HASH.analyse}>voir dans Analyse</a>.</p>
      )}
    </>
  );
  const planReady = !!plan && !!course && !otherRace;
  // Les barrières serrées ou dépassées sont déjà dans le bandeau et le roadbook : on ne les répète pas en avertissement.
  const planWarnings = (plan?.warnings ?? []).filter((w) => !/^(Barrière horaire dépassée|Marge de moins d'1 h)/.test(w));

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={TAB_HASH.accueil} aria-label="Ravitaille : accueil">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Ravitaille</span>
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
          <button type="button" className="ghost" onClick={() => setPdfMenu((m) => !m)} disabled={savingPdf}
            aria-disabled={pdfBlocked ? true : undefined} aria-expanded={pdfMenu} aria-haspopup="menu"
            title="Télécharger le plan en PDF, ou le parcours pour ta montre Garmin">
            {savingPdf ? 'PDF…' : 'Télécharger ▾'}
          </button>
          {pdfMenu && (pdfBlocked ? (
            <div className="pdf-menu-list" role="status">
              <p className="pdf-blocked">{pdfBlocked}</p>
            </div>
          ) : (
            <div className="pdf-menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => void savePdf('summary')}>
                <strong>Résumé · 1 page</strong>
                <span className="muted small">Passages, barrières et ravitos, à garder sur soi</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void savePdf('full')}>
                <strong>Complet</strong>
                <span className="muted small">Tout le plan : profil, références, préparation, nutrition, matériel</span>
              </button>
              <hr />
              <button type="button" role="menuitem" onClick={() => { setPdfMenu(false); setGarminOpen(true); }}>
                <strong>Parcours pour ma Garmin (.fit)</strong>
                <span className="muted small">Trace, ravitos et partenaire virtuel au rythme du plan</span>
              </button>
            </div>
          ))}
        </div>
      </header>

      <nav className="tabs no-print" aria-label="Pages">
        {TABS.map(([id, label]) => (
          <a key={id} href={TAB_HASH[id]} aria-current={tab === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>

      {status.kind === 'unreachable' && hasData.current && (
        <div className="banner warn no-print" role="status">
          Pas de connexion : voici ton dernier plan calculé
          {data && <> (le {new Date(data.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})</>}.
          Il se mettra à jour dès que le réseau revient.{' '}
          <button type="button" className="link-btn" onClick={() => void compute(references, source)}>Réessayer</button>
        </div>
      )}
      {status.kind === 'unreachable' && !hasData.current && (
        <div className="banner error" role="alert">
          Le serveur ne répond pas. Vérifie ta connexion ; s'il dormait, il met environ une minute à se réveiller.{' '}
          <button type="button" className="link-btn" onClick={() => void compute(references, source)}>Réessayer</button>
        </div>
      )}
      {status.kind === 'rejected' && (
        <div className="banner error" role="alert">
          Le plan n'a pas pu être calculé : {status.error.charAt(0).toLowerCase() + status.error.slice(1)}{' '}
          <button type="button" className="link-btn" onClick={() => void compute(references, source)}>Réessayer</button>
        </div>
      )}

      {tab === 'algo' && <AlgorithmPage plan={plan} />}
      {tab === 'accueil' && (
        <WelcomePage plan={plan} isExample={mode === 'demo'} feedbackUrl={feedbackUrl}
          onOpenPlan={() => goTab('plan')}
          onMyRace={() => { switchMode('custom'); goTab('plan'); }}
          onAlgorithm={() => goTab('algo')} />
      )}

      {tab === 'course' && (plan && course
        ? <RaceView plan={plan} course={course} services={services} profile={nutritionProfile} crew={crew}
          onShareCrew={crew.length > 0 ? (fix, message) => shareCrew(fix, null, message) : undefined} />
        : <p className="muted race-empty">Calcule d'abord le plan de ta course dans « Mon plan » : cette page te guidera point
          par point le jour J.</p>)}

      <main className="layout single" hidden={tab === 'algo' || tab === 'accueil' || tab === 'course'}>

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

          {tab === 'plan' && mode === 'demo' && (
            <div className="example-banner no-print" role="note">
              <span>Tu regardes <strong>un exemple</strong> : {course?.race.name ?? 'une course type'}, avec des références types.</span>
              <button type="button" onClick={() => switchMode('custom')}>Préparer ma course</button>
            </div>
          )}

          {tab === 'plan' && !planReady && <div className="plan-refs plan-refs-alone no-print">{side}</div>}

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
          {tab === 'plan' && plan && course && (
            <div className="plan-page">
              {plans.length > 0 && <PlanHero plans={plans} selected={scenarioIndex} onSelect={setScenarioIndex} />}

              <div className="plan-notes">
                {plan.training && <TrainingLine plan={plan} onDetails={() => goTab('analyse')} />}
                {planWarnings.length > 0 && (
                  <ul className="warnings">
                    {planWarnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
                {toPlace.length > 0 && !placing && (
                  <div className="placement-banner no-print" role="status">
                    <span>
                      <strong>{toPlace.length === 1 ? '1 ravito à vérifier sur la trace' : `${toPlace.length} ravitos à vérifier sur la trace`} :</strong>{' '}
                      {toPlace.map((i) => course.markers[i].name).join(', ')}. Le D+ du roadbook ou le waypoint du GPX ne
                      colle pas avec leur position : la montre t'annoncerait le ravito au mauvais endroit.
                    </span>
                    <button type="button" onClick={openPlacing}>Les placer sur la carte</button>
                  </div>
                )}
                {placing && canPlace && (
                  <PlacementEditor course={course} plan={plan} saving={savingPlaces} hoverKm={hoverKm} onHover={setHoverKm}
                    onSave={(positions) => void savePlaces(positions)} onCancel={() => setPlacing(false)} />
                )}
              </div>

              {course.track && (
                <section className="plan-profile plan-rule" aria-label="Profil">
                  <ElevationProfile track={course.track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={setHoverKm} />
                </section>
              )}

              <Roadbook plan={plan} markers={course.markers} services={services} crew={crew} onHover={setHoverKm}
                onDetails={() => goTab('analyse')} />

              {course.track && !placing && (
                <section className="plan-map plan-rule no-print" aria-label="Carte">
                  <div className="roadbook-head">
                    <span className="overline">Carte</span>
                    {canPlace && <button type="button" className="link-btn" onClick={openPlacing}
                      title="Déplacer les ravitos le long de la trace, là où ils sont vraiment">Ajuster les ravitos</button>}
                    <button type="button" className="link-btn plan-map-toggle" aria-expanded={showMap}
                      onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? 'Masquer la carte' : 'Voir la carte'}</button>
                  </div>
                  {showMap && <CourseMap track={course.track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={setHoverKm} />}
                </section>
              )}

              <div className="plan-refs no-print">{side}</div>
            </div>
          )}

          {tab === 'ravitos' && plan && course && <div className="tab-tools"><Legend /></div>}
          {tab === 'ravitos' && plan && course && (
            <RavitosView plan={plan} services={services} profile={nutritionProfile} onProfileChange={changeNutritionProfile}
              onShareCrew={(runner) => shareCrew(loadFix(course.race.name, plan.start), runner)}
              crew={crew} onCrewChange={changeCrew} />
          )}

          {tab === 'sac' && course && <GearCard raceName={course.race.name} plan={plan} profile={nutritionProfile} />}

          {tab === 'analyse' && <>
            <div className="tab-tools"><Legend /></div>
            <p className="muted tab-intro">Ce que « Mon plan » résume : le poids de chaque référence, ta préparation, le tableau
              complet (tronçons, allures, arrêts) et les trois scénarios côte à côte.</p>
            {plan && <ReferenceInsights plan={plan} />}
            {plan?.training && <TrainingCard plan={plan} />}
            <RunnerProfileCard stored={runner} onChange={changeRunner} isExample={mode === 'demo'} />
            {plans.length > 1 && (
              <div className="plan-hero-scenarios analyse-scenario" role="group" aria-label="Scénario du tableau détaillé">
                {plans.map((p, i) => (
                  <button key={p.scenario.name} type="button" aria-pressed={i === scenarioIndex}
                    className={i === scenarioIndex ? 'active' : ''} onClick={() => setScenarioIndex(i)}>{p.scenario.name}</button>
                ))}
              </div>
            )}
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
      {garminOpen && course && plans.length > 0 && (
        <GarminExport course={course} plans={plans} selected={scenarioIndex} services={services} onClose={() => setGarminOpen(false)} />
      )}
      <MobileNav tab={tab} hrefs={TAB_HASH} onPdf={(v) => void savePdf(v)} onGarmin={() => setGarminOpen(true)} pdfDisabled={savingPdf || !!pdfBlocked}
        pdfReason={pdfBlocked}
        feedbackUrl={feedbackUrl} />
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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
