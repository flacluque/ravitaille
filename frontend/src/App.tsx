import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCourse, fetchPlans, loadSnapshot, saveSnapshot, type Snapshot } from './api/client';
import type { ElevationSource, Reference } from './api/types';
import { CompareTable } from './components/CompareTable';
import { CourseMap } from './components/CourseMap';
import { ElevationProfile } from './components/ElevationProfile';
import { PassageTable } from './components/PassageTable';
import { ReferenceForm } from './components/ReferenceForm';
import { ScenarioCards } from './components/ScenarioCards';
import { formatClock, formatKm, formatMeters } from './lib/format';

// Seule course embarquée pour l'instant (src/main/resources/samples/bogomiles).
const SAMPLE_ID = 'bogomiles';
const DEFAULT_REFERENCE: Reference = { km: 60, gainM: 3200, time: 'PT8H48M' };

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'offline'; error: string } | { kind: 'error'; error: string };

export function App() {
  const initial = useMemo(loadSnapshot, []);
  const [data, setData] = useState<Snapshot | null>(initial);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [scenarioIndex, setScenarioIndex] = useState(1); // Réaliste
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const hasData = useRef(initial !== null);

  const compute = useCallback(async (reference: Reference, source: ElevationSource) => {
    setStatus({ kind: 'loading' });
    try {
      const [course, plans] = await Promise.all([
        fetchCourse(SAMPLE_ID),
        fetchPlans(SAMPLE_ID, reference, source),
      ]);
      const snapshot: Snapshot = { sampleId: SAMPLE_ID, reference, source, course, plans, savedAt: new Date().toISOString() };
      setData(snapshot);
      saveSnapshot(snapshot);
      hasData.current = true;
      setStatus({ kind: 'ready' });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      // Pas de réseau mais un plan déjà calculé : on l'affiche, avec un bandeau.
      setStatus(hasData.current ? { kind: 'offline', error } : { kind: 'error', error });
    }
  }, []);

  useEffect(() => {
    void compute(initial?.reference ?? DEFAULT_REFERENCE, initial?.source ?? 'AUTO');
  }, [compute, initial]);

  const plans = data?.plans ?? [];
  const plan = plans[Math.min(scenarioIndex, plans.length - 1)];
  const course = data?.course;

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

      {status.kind === 'offline' && (
        <div className="banner warn no-print" role="status">
          Hors ligne : affichage du dernier plan calculé
          {data && <> (le {new Date(data.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})</>}.
        </div>
      )}
      {status.kind === 'error' && (
        <div className="banner error" role="alert">
          Impossible de joindre l'API : {status.error}. Vérifie que <code>mvn spring-boot:run</code> tourne.
        </div>
      )}

      <main className="layout">
        <aside className="side no-print">
          <ReferenceForm
            initialReference={data?.reference ?? DEFAULT_REFERENCE}
            initialSource={data?.source ?? 'AUTO'}
            loading={status.kind === 'loading'}
            onSubmit={compute}
          />
          {plan && <SourceNote source={plan.elevationSource} hasTrack={!!course?.track} />}
        </aside>

        <section className="content">
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

          {status.kind === 'loading' && !data && <p className="muted">Calcul en cours…</p>}
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
