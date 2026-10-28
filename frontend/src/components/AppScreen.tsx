import type { ReactNode } from 'react';
import { BackIcon, ChevronIcon } from './Icons';

/** Briques des écrans de l'appli sur téléphone : grand titre, retour, listes groupées. */

/** Grand titre d'une section (Accueil, Plan, Ravitos, Moi), comme dans une appli iPhone. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="screen-title">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

/** Barre d'une page ouverte depuis une section : retour à gauche, titre au centre. */
export function BackBar({ href, back, title }: { href: string; back: string; title: string }) {
  return (
    <div className="back-bar">
      <a href={href}><BackIcon />{back}</a>
      <h1>{title}</h1>
      <span aria-hidden />
    </div>
  );
}

/** Groupe de lignes sur fond blanc arrondi, avec son en-tête et sa note. */
export function ListGroup({ header, footer, children }: { header?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="list-group">
      {header && <h2>{header}</h2>}
      <div className="list-rows">{children}</div>
      {footer && <p className="list-footer">{footer}</p>}
    </section>
  );
}

export type RowTone = 'accent' | 'strava' | 'warm' | 'calm' | 'neutral';

interface RowProps {
  icon?: ReactNode;
  tone?: RowTone;
  title: ReactNode;
  detail?: ReactNode;
  /** À droite, avant le chevron : un état (« Connecté »), un compte. */
  value?: ReactNode;
  href?: string;
  /** Lien vers un autre site : nouvel onglet, sans chevron. */
  external?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

/** Une ligne de liste : un lien, un bouton, ou une simple information. */
export function ListRow({ icon, tone = 'accent', title, detail, value, href, external, onClick, disabled }: RowProps) {
  const inner = (
    <>
      {icon && <span className={`row-icon ${tone}`}>{icon}</span>}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {detail && <span className="row-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {(href || onClick) && !external && <span className="row-chevron"><ChevronIcon /></span>}
    </>
  );
  if (href && !disabled) {
    return external
      ? <a className="list-row" href={href} target="_blank" rel="noreferrer">{inner}</a>
      : <a className="list-row" href={href}>{inner}</a>;
  }
  if (onClick) {
    return <button type="button" className="list-row" onClick={onClick} disabled={disabled}>{inner}</button>;
  }
  return <div className="list-row">{inner}</div>;
}
