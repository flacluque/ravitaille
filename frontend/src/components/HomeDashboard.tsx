import { loadFix } from '../api/storage';
import type { CourseView, RacePlan } from '../api/types';
import { formatClock, formatHm, formatKm, formatMeters, localMinutes } from '../lib/format';
import { tightestCutoff } from '../lib/plan';
import { isRaceWindow, nowMinutes, offsetMinutes } from '../lib/race';
import type { ReactNode } from 'react';
import { ListGroup, ListRow } from './AppScreen';
import { PrepChecklist, type PrepItem } from './Races';
import { CourseStrip } from './CourseStrip';
import { ChevronDownIcon, DocIcon, FlagIcon, RouteIcon, StopwatchIcon, WatchIcon } from './Icons';

interface Props {
  mode: 'demo' | 'custom';
  course: CourseView | null;
  plan: RacePlan | null;
  /** Le plan suit encore la référence d'exemple : on propose Strava. */
  exampleReferences: boolean;
  loading: boolean;
  hrefs: { plan: string; course: string; sac: string; ravitos: string; references: string; retour: string };
  onMyRace: () => void;
  onEditRace: () => void;
  onStrava: () => void;
  onWatch: () => void;
  onPdf: () => void;
  /** Pourquoi la montre et le PDF ne sont pas disponibles (plan pas calculé ou périmé). */
  exportBlocked: string | null;
  /** Le titre ouvre « Mes courses ». */
  onRaces: () => void;
  /** Nom de la course quand son plan n'est pas encore calculé. */
  draftName: string;
  /** Ce qui reste à préparer. */
  prep: PrepItem[];
  /** Clé de la course (api/races) : pointages du jour J. */
  raceKey: string;
}

/** Le nom de la course, en grand : on le touche pour changer de course. */
function RaceSwitcher({ title, subtitle, onClick }: { title: string; subtitle?: ReactNode; onClick: () => void }) {
  return (
    <div className="screen-title">
      <button type="button" className="race-switcher" onClick={onClick} aria-haspopup="dialog" aria-label={`${title} : changer de course`}>
        <h1>{title}</h1>
        <span className="race-switcher-chev" aria-hidden><ChevronDownIcon size={16} /></span>
      </button>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

/** « dans 12 jours », « dans 5 h », « demain » */
function countdown(minutes: number): { value: string; label: string } {
  if (minutes < 60) return { value: `${Math.max(1, Math.round(minutes))} min`, label: 'Départ dans' };
  if (minutes < 24 * 60) return { value: `${Math.round(minutes / 60)} h`, label: 'Départ dans' };
  const days = Math.round(minutes / 1440);
  return { value: `${days} jour${days > 1 ? 's' : ''}`, label: 'Départ dans' };
}

/**
 * Accueil de l'appli : l'état de la course en un coup d'œil (départ, arrivée, marge la plus serrée, sac), ce qui
 * reste à faire, et le chemin vers la vue En course le jour J.
 */
export function HomeDashboard({ mode, course, plan, exampleReferences, loading, hrefs, onMyRace, onEditRace, onStrava,
  onWatch, onPdf, exportBlocked, onRaces, draftName, prep, raceKey }: Props) {
  if (!course || !plan) {
    return (
      <div className="home">
        <RaceSwitcher title={mode === 'custom' ? draftName : 'Ravitime'} onClick={onRaces} />
        {loading ? <p className="muted">Calcul en cours…</p> : (
          <div className="home-empty">
            <p>Saisis ta course (roadbook, trace GPX) : Ravitime calcule ton heure de passage à chaque ravito.</p>
            <button type="button" className="big-btn" onClick={onEditRace}>Saisir ma course</button>
          </div>
        )}
      </div>
    );
  }

  const now = nowMinutes();
  const start = localMinutes(plan.start);
  const racing = isRaceWindow(plan, now) && now >= start - 3 * 60;
  const over = now > localMinutes(plan.finish) + 6 * 60;
  const tight = tightestCutoff(plan);
  const margin = tight?.cutoff.marginMinutes ?? null;
  const marginTone = margin === null ? '' : margin < 0 ? 'missed' : margin < 60 ? 'tight' : 'ok';
  const [finishDay, finishTime] = formatClock(plan.finish).split(' ');
  const startLabel = new Date(`${course.race.start}`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="home">
      <RaceSwitcher title={course.race.name} onClick={onRaces}
        subtitle={<>{mode === 'demo' ? 'Exemple · ' : ''}{startLabel} · départ {formatClock(plan.start).split(' ')[1]}</>} />

      {mode === 'demo' && (
        <div className="home-note">
          <p><strong>Tu regardes un exemple.</strong> Saisis ta course pour avoir ton propre plan.</p>
          <button type="button" onClick={onMyRace}>Préparer ma course</button>
        </div>
      )}

      {racing ? (
        <a className="tile tile-go tile-wide" href={hrefs.course}>
          <span className="tile-label">C'est le jour J</span>
          <span className="tile-value">En course</span>
          <span className="tile-sub">Prochain ravito, avance ou retard</span>
        </a>
      ) : over && mode === 'custom' && (
        <a className="tile tile-go tile-wide" href={hrefs.retour}>
          <span className="tile-label">Course terminée</span>
          <span className="tile-value">Retour de course</span>
          <span className="tile-sub">Compare avec ton activité Strava</span>
        </a>
      )}

      <a className="home-course" href={hrefs.plan} aria-label="Ouvrir le plan">
        <span className="home-course-head">
          <span>{formatKm(plan.totalDistanceKm)} km · {formatMeters(plan.totalGainM)} D+ · {plan.checkpoints.length} points</span>
          {!racing && !over && mode === 'custom' && <strong>départ dans {countdown(start - now).value}</strong>}
        </span>
        <CourseStrip plan={plan} course={course} live={racing ? { now, offset: offsetMinutes(plan, loadFix(raceKey, plan.start)) } : null} />
      </a>

      <div className="home-tiles">
        <a className="tile" href={hrefs.plan}>
          <span className="tile-label">Arrivée prévue</span>
          <span className="tile-value">{finishDay} {finishTime}</span>
          <span className="tile-sub">{formatHm((localMinutes(plan.finish) - start))} · {plan.scenario.name.toLowerCase()}</span>
        </a>
        <a className={`tile margin ${marginTone}`} href={hrefs.plan}>
          <span className="tile-label">Marge la plus serrée</span>
          <span className="tile-value">{margin === null ? '—' : margin < 0 ? 'Dépassée' : formatHm(margin)}</span>
          <span className="tile-sub">{tight ? tight.eta.name : 'Pas de barrière horaire'}</span>
        </a>
      </div>

      {exampleReferences && (
        <div className="home-strava" role="note">
          <span className="home-strava-mark"><RouteIcon size={20} /></span>
          <div>
            <p><strong>Ton plan suit une course d'exemple.</strong> Importe tes courses depuis Strava : ton plan suivra ton
              rythme.</p>
            <button type="button" onClick={onStrava}>Importer depuis Strava</button>
          </div>
        </div>
      )}

      <h2 className="home-section">À préparer</h2>
      <PrepChecklist items={prep} />

      <ListGroup header="Pour la course" footer={exportBlocked ?? undefined}>
        {racing && <ListRow icon={<StopwatchIcon size={18} />} tone="warm" title="En course" detail="Prochain ravito, avance ou retard" href={hrefs.course} />}
        <ListRow icon={<WatchIcon size={18} />} tone="warm" title="Ta montre" detail="Parcours Garmin et champ Prochain Ravito, ou .gpx"
          onClick={onWatch} disabled={!!exportBlocked} />
        <ListRow icon={<DocIcon size={18} />} tone="neutral" title="Plan en PDF" detail="Une page à glisser dans la poche"
          onClick={onPdf} disabled={!!exportBlocked} />
        {mode === 'custom' && <ListRow icon={<FlagIcon size={18} />} tone="neutral" title="Modifier ma course" detail="Roadbook, trace, ravitos" onClick={onEditRace} />}
      </ListGroup>
    </div>
  );
}
