import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { addDays, formatDay, formatDayLong, isIsoDate, monthGrid, MONTHS, todayIso } from '../lib/dates';

interface Props {
  /** Date ISO "2026-10-23", ou "" si aucune. */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** Propose « Effacer » : la date est facultative. */
  clearable?: boolean;
  /** Période à surligner (début inclus, fin exclue), ex. le bloc de préparation. */
  highlight?: { from: string; to: string; label: string } | null;
  /** Jour à signaler d'un drapeau, ex. la course. */
  flag?: { date: string; label: string } | null;
  ariaLabel?: string;
  className?: string;
}

const WEEKDAYS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];

/** Calendrier en français, semaines du lundi au dimanche, avec choix rapide du mois et de l'année. */
export function DatePicker({ value, onChange, placeholder = 'Choisir une date', clearable, highlight, flag, ariaLabel, className }: Props) {
  const today = todayIso();
  const valid = isIsoDate(value);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(valid ? value : today);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const year = Number(focus.slice(0, 4));
  const month = Number(focus.slice(5, 7)) - 1;
  const days = monthGrid(year, month);
  const years = Array.from({ length: 13 }, (_, i) => Number(today.slice(0, 4)) - 10 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);

  function show() {
    setFocus(valid ? value : today);
    setOpen(true);
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
    button.current?.focus();
  }

  // Le calendrier flotte au-dessus de tout (fenêtres, cartes) : position calculée depuis le bouton.
  useLayoutEffect(() => {
    if (!open || !button.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const width = 296;
      const height = panel.current?.offsetHeight ?? 340;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = r.bottom + 6 + height <= window.innerHeight;
      setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    // Échap ferme le calendrier, et lui seul (pas la fenêtre qui le contient).
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  // Le jour actif garde le focus quand on navigue au clavier (une fois le calendrier placé et visible).
  useEffect(() => {
    if (open && pos) panel.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
  }, [open, pos, focus]);

  function onKey(e: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in moves) {
      e.preventDefault();
      setFocus((f) => addDays(f, moves[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      shiftMonth(e.key === 'PageUp' ? -1 : 1);
    }
  }

  function shiftMonth(delta: number) {
    setFocus((f) => {
      const d = new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1 + delta, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(Number(f.slice(8, 10)), last));
      return d.toISOString().slice(0, 10);
    });
  }

  function setMonthYear(y: number, m: number) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    setFocus(new Date(Date.UTC(y, m, Math.min(Number(focus.slice(8, 10)), last))).toISOString().slice(0, 10));
  }

  return (
    <>
      <button ref={button} type="button" className={`date-picker-btn ${className ?? ''}`} onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel} : ${valid ? formatDayLong(value) : 'aucune'}` : undefined}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className={valid ? undefined : 'muted'}>{valid ? formatDay(value) : placeholder}</span>
      </button>
      {open && createPortal(
        <div ref={panel} className="date-picker" role="dialog" aria-modal="false" aria-labelledby={titleId} onKeyDown={onKey}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => shiftMonth(-1)} aria-label="Mois précédent">‹</button>
            <span id={titleId} className="dp-title">
              <select value={month} onChange={(e) => setMonthYear(year, Number(e.target.value))} aria-label="Mois">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={year} onChange={(e) => setMonthYear(Number(e.target.value), month)} aria-label="Année">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </span>
            <button type="button" className="dp-nav" onClick={() => shiftMonth(1)} aria-label="Mois suivant">›</button>
          </div>
          <div className="dp-grid" role="grid">
            {WEEKDAYS.map((d) => <span key={d} className="dp-weekday" aria-hidden>{d}</span>)}
            {days.map((d) => {
              const inMonth = Number(d.slice(5, 7)) - 1 === month;
              const inRange = !!highlight && d >= highlight.from && d < highlight.to;
              const classes = ['dp-day',
                inMonth ? '' : 'out', d === today ? 'today' : '', d === value ? 'selected' : '',
                inRange ? 'range' : '', inRange && d === highlight!.from ? 'range-start' : '',
                inRange && d === addDays(highlight!.to, -1) ? 'range-end' : '', flag?.date === d ? 'flag' : ''].filter(Boolean).join(' ');
              const notes = [d === today && "aujourd'hui", inRange && highlight!.label, flag?.date === d && flag.label].filter(Boolean);
              return (
                <button key={d} type="button" className={classes} data-day={d} tabIndex={d === focus ? 0 : -1}
                  aria-pressed={d === value} aria-label={[formatDayLong(d), ...notes].join(', ')}
                  onClick={() => pick(d)} onFocus={() => setFocus(d)}>
                  {Number(d.slice(8, 10))}
                </button>
              );
            })}
          </div>
          {(highlight || flag) && (
            <p className="dp-legend">
              {highlight && <span><i className="dp-swatch range" aria-hidden /> {highlight.label}</span>}
              {flag && <span><i className="dp-swatch flag" aria-hidden /> {flag.label}</span>}
            </p>
          )}
          <div className="dp-foot">
            <button type="button" className="link-btn" onClick={() => pick(today)}>Aujourd'hui</button>
            {clearable && value && <button type="button" className="link-btn" onClick={() => pick('')}>Effacer</button>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
