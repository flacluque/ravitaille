import { useEffect, useRef, useState, type ReactNode } from 'react';

type MainTab = 'plan' | 'course' | 'ravitos' | 'sac';

interface Props {
  tab: string;
  hrefs: Record<string, string>;
  onPdf: (variant: 'summary' | 'full') => void;
  pdfDisabled: boolean;
  feedbackUrl: string | null;
}

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

const ICONS: Record<MainTab | 'more', ReactNode> = {
  plan: <svg {...ICON}><path d="M5 19c3-1 3-5 7-6s4-6 7-8" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /></svg>,
  course: <svg {...ICON}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M10 2h4" /></svg>,
  ravitos: <svg {...ICON}><path d="M9 3h6M10 3v3l-2 3v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9l-2-3V3" /><path d="M8 13h8" /></svg>,
  sac: <svg {...ICON}><path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2M9 14h6" /></svg>,
  more: <svg {...ICON}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>,
};

const MAIN: [MainTab, string][] = [['plan', 'Plan'], ['course', 'En course'], ['ravitos', 'Ravitos'], ['sac', 'Sac']];

/**
 * Sur téléphone : les onglets en bas, à portée de pouce. « Plus » regroupe le reste : accueil,
 * analyse, explication du calcul, PDF et avis.
 */
export function MobileNav({ tab, hrefs, onPdf, pdfDisabled, feedbackUrl }: Props) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [tab]);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', escape);
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  const inMore = !MAIN.some(([id]) => id === tab);

  return (
    <>
      {open && <div className="sheet-backdrop no-print" onClick={() => setOpen(false)} aria-hidden />}
      {open && (
        <div ref={sheet} className="more-sheet no-print" role="dialog" aria-label="Plus">
          <a href={hrefs.accueil} aria-current={tab === 'accueil' ? 'page' : undefined}>Accueil</a>
          <a href={hrefs.analyse} aria-current={tab === 'analyse' ? 'page' : undefined}>Analyse détaillée</a>
          <a href={hrefs.algo} aria-current={tab === 'algo' ? 'page' : undefined}>Comment ça marche</a>
          <hr />
          <button type="button" disabled={pdfDisabled} onClick={() => { setOpen(false); onPdf('summary'); }}>
            PDF résumé · 1 page<span className="muted small">passages, barrières, ravitos</span></button>
          <button type="button" disabled={pdfDisabled} onClick={() => { setOpen(false); onPdf('full'); }}>
            PDF complet<span className="muted small">tout le plan</span></button>
          {pdfDisabled && <p className="muted small">Le PDF se télécharge une fois le plan calculé.</p>}
          {feedbackUrl && <><hr /><a href={feedbackUrl} target="_blank" rel="noreferrer">Donner mon avis</a></>}
        </div>
      )}
      <nav className="mobile-nav no-print" aria-label="Pages">
        {MAIN.map(([id, label]) => (
          <a key={id} href={hrefs[id]} aria-current={tab === id ? 'page' : undefined}>{ICONS[id]}<span>{label}</span></a>
        ))}
        <button type="button" aria-expanded={open} aria-current={inMore ? 'page' : undefined} onClick={() => setOpen((o) => !o)}>
          {ICONS.more}<span>Plus</span>
        </button>
      </nav>
    </>
  );
}
