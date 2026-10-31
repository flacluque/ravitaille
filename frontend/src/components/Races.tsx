import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CourseView, RacePlan } from '../api/types';
import { formatClock, formatHm, formatKm, formatMeters, localMinutes } from '../lib/format';
import { tightestCutoff } from '../lib/plan';
import { countdown, frDay, raceDay, raceName, sortRaces, type RaceBook, type RaceEntry } from '../lib/races';
import { CourseStrip } from './CourseStrip';
import { ChevronDownIcon, PlusIcon, TrashIcon } from './Icons';
import { modalCloseMs } from './Motion';

/**
 * « Mes courses » : la liste (feuille sur téléphone, menu et colonne sur ordinateur), le tableau de bord du site, et
 * ce qui reste à préparer pour la course affichée.
 */

export interface RaceListProps {
  book: RaceBook;
  /** La course affichée, null sur l'exemple. */
  shownId: string | null;
  /** Courses passées dont le retour de course est fait. */
  reviewed: Set<string>;
  onOpen: (id: string) => void;
  onNew: () => void;
  onExample: () => void;
  onDelete?: (id: string) => void;
}

/** Mini profil d'une course, d'après son résumé. */
function MiniProfile({ profile }: { profile: number[] }) {
  if (profile.length < 2) return null;
  const min = Math.min(...profile);
  const range = Math.max(1, Math.max(...profile) - min);
  const line = profile.map((a, i) => `${i ? 'L' : 'M'}${((i / (profile.length - 1)) * 320).toFixed(1)} ${(27 - ((a - min) / range) * 24).toFixed(1)}`).join(' ');
  return (
    <svg className="race-mini" viewBox="0 0 320 30" preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L320 30 L0 30 Z`} className="race-mini-area" />
      <path d={line} className="race-mini-line" />
    </svg>
  );
}

function RaceCard({ race, past, shown, reviewed, onOpen, onDelete, compact }: {
  race: RaceEntry; past: boolean; shown: boolean; reviewed: boolean; onOpen: () => void; onDelete?: () => void; compact?: boolean;
}) {
  const day = raceDay(race);
  const left = past ? null : countdown(race);
  const meta = race.summary
    ? `${formatKm(race.summary.km)} km · ${formatMeters(race.summary.gainM)} D+`
    : day ? 'Plan à calculer' : 'À saisir';
  return (
    <li className={`race-card${shown ? ' shown' : ''}${compact ? ' compact' : ''}`}>
      <button type="button" className="race-open" onClick={onOpen} aria-current={shown ? 'true' : undefined}>
        <span className="race-name">{raceName(race)}</span>
        <span className="race-when">
          {left && <strong>{left.value}</strong>}
          {day && <small>{frDay(day)}</small>}
        </span>
        <span className="race-meta">
          {meta}
          {shown && <span className="race-badge shown">affichée</span>}
          {past && (reviewed
            ? <span className="race-badge ok">Retour fait</span>
            : <span className="race-badge todo">Retour à faire</span>)}
        </span>
        {!past && !compact && race.summary && <MiniProfile profile={race.summary.profile} />}
      </button>
      {onDelete && (
        <button type="button" className="race-delete" onClick={onDelete} aria-label={`Supprimer ${raceName(race)}`} title="Supprimer">
          <TrashIcon size={16} />
        </button>
      )}
    </li>
  );
}

/** À venir (la plus proche d'abord), puis passées ; nouvelle course ; l'exemple. */
export function RaceList({ book, shownId, reviewed, onOpen, onNew, onExample, onDelete, compact = false }: RaceListProps & { compact?: boolean }) {
  const { upcoming, past } = sortRaces(book.races);
  const remove = onDelete && ((r: RaceEntry) => {
    if (window.confirm(`Supprimer « ${raceName(r)} » ? Son plan, sa trace, son sac et ses pointages seront effacés de cet appareil.`)) onDelete(r.id);
  });
  const card = (r: RaceEntry, isPast: boolean) => (
    <RaceCard key={r.id} race={r} past={isPast} shown={r.id === shownId} reviewed={reviewed.has(r.id)} compact={compact}
      onOpen={() => onOpen(r.id)} onDelete={remove ? () => remove(r) : undefined} />
  );
  return (
    <div className="race-list">
      {upcoming.length > 0 && <>
        <h3 className="race-section">À venir</h3>
        <ul>{upcoming.map((r) => card(r, false))}</ul>
      </>}
      {past.length > 0 && <>
        <h3 className="race-section">Passées</h3>
        <ul>{past.map((r) => card(r, true))}</ul>
      </>}
      {book.races.length === 0 && <p className="muted">Pas encore de course : ajoute celle que tu prépares.</p>}
      <button type="button" className="race-new" onClick={onNew}><PlusIcon size={18} /> Nouvelle course</button>
      <button type="button" className="link-btn race-example" onClick={onExample} aria-pressed={shownId === null}>
        Voir un exemple de plan
      </button>
    </div>
  );
}

/** Téléphone : « Mes courses » dans une feuille qui monte du bas. */
export function RacesSheet({ onClose, ...list }: RaceListProps & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  function close(then?: () => void) {
    const d = dialog.current;
    if (!d || d.classList.contains('is-closing')) return;
    let done = false;
    const finish = () => { if (!done) { done = true; d.close(); then?.(); } };
    d.addEventListener('animationend', (e) => { if (e.target === d) finish(); }, { once: true });
    d.classList.add('is-closing');
    window.setTimeout(finish, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : modalCloseMs() + 80);
  }
  return (
    <dialog ref={dialog} className="races-sheet t-sheet" aria-labelledby="races-title" onClose={onClose}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="sheet-grabber" aria-hidden />
      <div className="sheet-head">
        <h2 id="races-title">Mes courses</h2>
        <button type="button" className="sheet-close" aria-label="Fermer" onClick={() => close()}>✕</button>
      </div>
      <RaceList {...list}
        onOpen={(id) => close(() => list.onOpen(id))}
        onNew={() => close(list.onNew)}
        onExample={() => close(list.onExample)} />
    </dialog>
  );
}

/** Ordinateur : le nom de la course dans la barre du haut ; il ouvre la liste, depuis n'importe quel onglet. */
export function RacePicker({ title, subtitle, ...list }: RaceListProps & { title: string; subtitle: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);
  const pick = (run: () => void) => () => { setOpen(false); run(); };
  return (
    <div className="race-picker" ref={box}>
      <button type="button" className="race-picker-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <ChevronDownIcon size={18} />
      </button>
      {open && (
        <div className="race-picker-menu" role="dialog" aria-label="Mes courses">
          <RaceList {...list} compact
            onOpen={(id) => pick(() => list.onOpen(id))()}
            onNew={pick(list.onNew)}
            onExample={pick(list.onExample)}
            onDelete={undefined} />
        </div>
      )}
    </div>
  );
}

export type PrepState = 'ok' | 'todo' | 'optional';

export interface PrepItem {
  title: string;
  detail: string;
  state: PrepState;
  href?: string;
  onClick?: () => void;
}

/** Ce qui reste à préparer pour la course : fait (✓), à faire (!), facultatif (·). */
export function PrepChecklist({ items }: { items: PrepItem[] }) {
  return (
    <ul className="prep-list">
      {items.map((item) => {
        const inner = <>
          <span className={`prep-mark ${item.state}`} aria-hidden>{item.state === 'ok' ? '✓' : item.state === 'todo' ? '!' : '·'}</span>
          <span className="prep-text">
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </span>
        </>;
        const label = `${item.title} : ${item.state === 'ok' ? 'fait' : item.state === 'todo' ? 'à faire' : 'facultatif'}, ${item.detail}`;
        return (
          <li key={item.title}>
            {item.href ? <a className="prep-item" href={item.href} aria-label={label}>{inner}</a>
              : <button type="button" className="prep-item" onClick={item.onClick} aria-label={label}>{inner}</button>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Site : l'Accueil d'un coureur qui a des courses. La course affichée (arrivée, marge, profil, ce qui reste à
 * préparer) à gauche, toutes ses courses à droite.
 */
export function RaceDashboard({ plan, course, isExample, prep, list, loading, onEditRace }: {
  plan: RacePlan | null;
  course: CourseView | null;
  isExample: boolean;
  prep: PrepItem[];
  list: RaceListProps;
  loading: boolean;
  onEditRace: () => void;
}) {
  const shownRace = list.book.races.find((r) => r.id === list.shownId) ?? null;
  const left = shownRace ? countdown(shownRace) : null;
  const tight = plan ? tightestCutoff(plan) : null;
  const margin = tight?.cutoff.marginMinutes ?? null;
  const name = course?.race.name ?? (shownRace ? raceName(shownRace) : 'Ta course');
  const start = plan ? new Date(plan.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return (
    <div className="race-dashboard">
      <div className="race-dashboard-main">
        <div>
          <h1>{name}</h1>
          <p className="muted">
            {isExample ? 'Exemple · ' : ''}{start ?? 'Course à saisir'}
            {plan && <> · départ {formatClock(plan.start).split(' ')[1]}</>}
            {left && <> · {left.label}</>}
          </p>
        </div>
        {plan && course ? <>
          <div className="dash-hero-row">
            <a className="dash-hero" href="#plan">
              <span className="dash-hero-label">Arrivée prévue · {plan.scenario.name.toLowerCase()}</span>
              <span className="dash-hero-value">{formatClock(plan.finish)}</span>
              <span>{formatHm(localMinutes(plan.finish) - localMinutes(plan.start))} de course · {formatKm(plan.totalDistanceKm)} km
                · {formatMeters(plan.totalGainM)} D+</span>
            </a>
            <a className={`tile margin ${margin === null ? '' : margin < 0 ? 'missed' : margin < 60 ? 'tight' : 'ok'}`} href="#plan">
              <span className="tile-label">Marge la plus serrée</span>
              <span className="tile-value">{margin === null ? '—' : margin < 0 ? 'Dépassée' : formatHm(margin)}</span>
              <span className="tile-sub">{tight ? tight.eta.name : 'Pas de barrière horaire'}</span>
            </a>
          </div>
          <a className="home-course" href="#plan" aria-label="Ouvrir le plan">
            <CourseStrip plan={plan} course={course} />
          </a>
          <PrepChecklist items={prep} />
        </> : (
          <div className="home-empty">
            {loading ? <p className="muted">Calcul en cours…</p> : <>
              <p>Saisis ta course (roadbook, trace GPX) : Ravitime calcule ton heure de passage à chaque ravito.</p>
              <button type="button" className="big-btn" onClick={onEditRace}>Saisir ma course</button>
            </>}
          </div>
        )}
      </div>
      <aside className="race-dashboard-side">
        <h2>Mes courses</h2>
        <RaceList {...list} />
      </aside>
    </div>
  );
}
