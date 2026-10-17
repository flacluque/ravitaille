import { useEffect, useMemo, useState } from 'react';
import { loadFix, saveFix } from '../api/storage';
import type { CourseView, RacePlan, Service } from '../api/types';
import { TRACK_COLOR } from '../lib/colors';
import { formatClockFromMinutes, formatDuration, formatKm, localMinutes } from '../lib/format';
import { computeNutrition, describeActions, describeFill, describeRhythm, type NutritionProfile } from '../lib/nutrition';
import { adjustedArrival, adjustedMargin, formatDelay, nowMinutes, offsetMinutes, raceProgress, type Fix } from '../lib/race';
import { StatusBadge } from './StatusBadge';
import { ConfirmBar } from './ConfirmBar';
import { UndoToast, useUndo } from './UndoToast';
import type { ShareResult } from '../lib/crewShare';

interface Props {
  plan: RacePlan;
  course: CourseView;
  services: Service[][];
  profile: NutritionProfile;
  crew: string[];
  /** Renvoie le lien de suivi à l'assistance, avec le recalage (absent sans assistance). */
  onShareCrew?: (fix: Fix | null, message: string) => Promise<ShareResult>;
}

const clock = (minutes: number) => formatClockFromMinutes(minutes);
/** Au-delà de cet écart avec l'heure prévue (minutes), « Je suis à … » demande confirmation. */
const CONFIRM_GAP = 20;

/**
 * « En course » : une page par point, comme un roadbook qu'on feuillette au téléphone. Pilotée par
 * l'horloge ; « Je suis à ce point » recale la suite sur l'heure réelle.
 */
export function RaceView({ plan, course, services, profile, crew, onShareCrew }: Props) {
  const raceName = course.race.name;
  const [fix, setFix] = useState<Fix | null>(() => loadFix(raceName, plan.start));
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMinutes()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setFix(loadFix(raceName, plan.start)), [raceName, plan.start]);

  const progress = raceProgress(plan, now, fix);
  const [shown, setShown] = useState<number | null>(null);
  const index = shown ?? progress.next;
  const n = useMemo(() => computeNutrition(plan, services, profile, crew), [plan, services, profile, crew]);
  const last = plan.checkpoints.length - 1;
  const offset = offsetMinutes(plan, fix);

  const [crewNotice, setCrewNotice] = useState<ShareResult | null>(null);
  // Un tap dans la poche ne doit pas décaler toute la course : confirmation si l'heure est loin du prévu,
  // et annulation possible quelques secondes après.
  const undo = useUndo();
  const [confirming, setConfirming] = useState<{ index: number; at: number; gap: number } | null>(null);
  function commit(target: number, at: number) {
    const previous = fix;
    const next = { index: target, atMinutes: Math.round(at) };
    setFix(next);
    saveFix(raceName, plan.start, next);
    setShown(null);
    setCrewNotice(null);
    setConfirming(null);
    undo.offer(`Pointé à ${plan.checkpoints[target].name} à ${clock(at)}.`, () => {
      setFix(previous);
      saveFix(raceName, plan.start, previous);
    });
  }
  function arrived(at: number) {
    // Écart avec l'heure prévue à ce point, sans tenir compte d'un recalage à ce même point.
    const expected = adjustedArrival(plan, index, fix && fix.index < index ? fix : null);
    const gap = at - expected;
    if (Math.abs(gap) > CONFIRM_GAP) setConfirming({ index, at, gap });
    else commit(index, at);
  }
  async function notifyCrew() {
    if (!fix || !onShareCrew) return;
    const late = offsetMinutes(plan, fix);
    const where = plan.checkpoints[fix.index].name;
    const message = `Je suis passé à ${where} à ${clock(fix.atMinutes)}`
      + (Math.abs(late) < 2 ? ", pile à l'heure du plan." : `, ${formatDelay(late)} ${late < 0 ? "d'avance" : 'de retard'}.`)
      + ' Mes heures mises à jour :';
    setCrewNotice(await onShareCrew(fix, message));
  }
  function clearFix() {
    setFix(null);
    saveFix(raceName, plan.start, null);
  }

  const eta = plan.checkpoints[index];
  const arrival = adjustedArrival(plan, index, fix);
  const margin = adjustedMargin(plan, index, fix);
  const leg = index > 0 ? n.legs.find((l) => l.index === index) : undefined;
  const point = n.points[index];
  const actions = index === last ? '' : describeActions(point, n, profile, index === 0);
  const passed = fix ? index <= fix.index : arrival <= now && index < progress.next;

  return (
    <article className="race-view" aria-label="En course">
      <p className="race-status" role="status">
        {progress.phase === 'before'
          ? `Départ dans ${formatDelay(localMinutes(plan.start) - now)}, à ${clock(localMinutes(plan.start))}.`
          : progress.phase === 'finished'
            ? 'Course terminée. Bravo !'
            : fix
              ? offset > 1 ? `${formatDelay(offset)} de retard sur le plan` : offset < -1 ? `${formatDelay(offset)} d'avance sur le plan` : "Pile à l'heure du plan"
              : "Heures du plan : tu n'as pas encore pointé"}
        {fix && <> · <button type="button" className="link-btn" onClick={clearFix}>annuler le recalage</button></>}
      </p>

      <nav className="race-nav" aria-label="Points">
        <button type="button" className="ghost" onClick={() => setShown(Math.max(0, index - 1))} disabled={index === 0}
          aria-label="Point précédent">‹</button>
        <span className="race-nav-pos">
          {index === 0 ? 'Départ' : index === last ? 'Arrivée' : `km ${formatKm(eta.km)}`}
          {index < last && ` · reste ${formatKm(plan.totalDistanceKm - eta.km)} km`}
          {shown !== null && shown !== progress.next && (
            <button type="button" className="link-btn" onClick={() => setShown(null)}>
              {progress.phase === 'before' ? 'départ' : 'prochain point'}</button>
          )}
        </span>
        <button type="button" className="ghost" onClick={() => setShown(Math.min(last, index + 1))} disabled={index === last}
          aria-label="Point suivant">›</button>
      </nav>

      <header className="race-point">
        <span className="code">{eta.code}</span>
        <h1>{eta.name}</h1>
      </header>

      <section className="race-time">
        <span className="race-time-label">{index === 0 ? 'Départ' : passed ? 'Passé à' : 'Arrivée prévue'}</span>
        <strong className="race-time-value">{clock(index === 0 ? localMinutes(eta.departure) : arrival)}</strong>
        {!passed && index > 0 && progress.phase !== 'before' && arrival > now && (
          <span className="race-time-in">dans {formatDelay(arrival - now)}</span>
        )}
        {margin && (
          <span className="race-cutoff">
            Barrière {margin.out ? 'en sortie ' : ''}{clock(localMinutes(margin.at))} <StatusBadge status={margin.status} minutes={margin.minutes} />
          </span>
        )}
      </section>

      {index > 0 && (
        <section className="race-block">
          <h2>Tronçon depuis {plan.checkpoints[index - 1].name}</h2>
          <p className="race-leg-figures">
            <span><strong>{formatKm(eta.legDistanceKm)}</strong> km</span>
            <span><strong>+{Math.round(eta.legGainM)}</strong> m</span>
            <span><strong>−{Math.round(eta.legLossM)}</strong> m</span>
            <span><strong>{formatDuration(eta.legDuration)}</strong></span>
          </p>
          {course.track && course.markers[index - 1] && course.markers[index] && (
            <LegProfile course={course} from={course.markers[index - 1].trackKm} to={course.markers[index].trackKm} />
          )}
          {leg && leg.nightMinutes >= 15 && (
            <p className="race-night">De nuit sur {formatDuration(`PT${Math.round(leg.nightMinutes)}M`)} : frontale allumée et pile de
              rechange, couche chaude à portée de main.</p>
          )}
          {leg && (
            <p><strong>Manger :</strong> {describeRhythm(leg, n, plan)}. <strong>Boire :</strong>{' '}
              {leg.refilled ? describeFill(leg.flasks, leg.drinkFlasks, n, '').trim() : 'la fin de tes flasques'}.</p>
          )}
        </section>
      )}

      {actions && (
        <section className="race-block race-todo">
          <h2>{index === 0 ? 'Avant de partir' : `À ${eta.name}`}</h2>
          <ul>{actions.split(' · ').map((a) => <li key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</li>)}</ul>
          {index < last && n.points[index].fillFlasks === 0 && index > 0 && <p className="race-dry">Pas d'eau ici : garde de quoi boire.</p>}
        </section>
      )}

      {progress.phase !== 'before' && index > 0 && (
        <div className="race-actions">
          {confirming && (
            <ConfirmBar
              message={`Il est ${clock(confirming.at)}, soit ${formatDelay(confirming.gap)} ${confirming.gap < 0 ? 'avant' : 'après'} l'heure prévue à ${plan.checkpoints[confirming.index].name}. Tu y es vraiment ?`}
              confirmLabel="Oui, j'y suis"
              onConfirm={() => commit(confirming.index, confirming.at)}
              onCancel={() => setConfirming(null)}
            />
          )}
          <button type="button" onClick={() => arrived(now)}>
            {fix?.index === index ? `Je suis à ${eta.name} (mettre à jour)` : `Je suis à ${eta.name}`}
          </button>
          <span className="muted small">Ton heure réelle recale la suite du plan et tes marges.</span>
          {fix && onShareCrew && (
            <button type="button" className="ghost" onClick={() => void notifyCrew()}>Prévenir mon assistance (lien à jour)</button>
          )}
          {crewNotice && <span className="small" role="status">{crewNotice === 'copied' ? 'Lien copié : colle-le dans WhatsApp.'
            : crewNotice === 'shared' ? 'Assistance prévenue.' : "Le lien n'a pas pu être partagé."}</span>}
        </div>
      )}
      <UndoToast undo={undo} />
    </article>
  );
}

/** Mini-profil du tronçon, pour voir d'un coup d'œil ce qui attend. */
function LegProfile({ course, from, to }: { course: CourseView; from: number; to: number }) {
  const pts = course.track!.profile.filter((p) => p.km >= from && p.km <= to);
  if (pts.length < 2) return null;
  const W = 320;
  const H = 72;
  const min = Math.min(...pts.map((p) => p.elevationM));
  const max = Math.max(...pts.map((p) => p.elevationM));
  const span = Math.max(50, max - min);
  const x = (km: number) => ((km - from) / Math.max(0.1, to - from)) * W;
  const y = (e: number) => 6 + (1 - (e - min) / span) * (H - 12);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.elevationM).toFixed(1)}`).join('');
  return (
    <svg className="race-leg-profile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
      aria-label={`Profil du tronçon : de ${Math.round(min)} à ${Math.round(max)} m d'altitude`}>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={TRACK_COLOR} opacity={0.15} />
      <path d={line} fill="none" stroke={TRACK_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
