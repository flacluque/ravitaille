import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackpackIcon, BottleIcon, MoreIcon, RouteIcon, StopwatchIcon } from './Icons';

type MainTab = 'plan' | 'course' | 'ravitos' | 'sac';

interface Props {
  tab: string;
  hrefs: Record<string, string>;
  onPdf: (variant: 'summary' | 'full') => void;
  pdfDisabled: boolean;
  /** Pourquoi le PDF n'est pas disponible (plan pas calculé ou périmé). */
  pdfReason: string | null;
  feedbackUrl: string | null;
}

const ICONS: Record<MainTab | 'more', ReactNode> = {
  plan: <RouteIcon />, course: <StopwatchIcon />, ravitos: <BottleIcon />, sac: <BackpackIcon />, more: <MoreIcon />,
};

const MAIN: [MainTab, string][] = [['plan', 'Plan'], ['course', 'En course'], ['ravitos', 'Ravitos'], ['sac', 'Sac']];

/**
 * Sur téléphone : les onglets en bas, à portée de pouce. « Plus » regroupe le reste : accueil,
 * analyse, explication du calcul, PDF et avis.
 */
export function MobileNav({ tab, hrefs, onPdf, pdfDisabled, pdfReason, feedbackUrl }: Props) {
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
          {pdfReason && <p className="muted small">{pdfReason}</p>}
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
