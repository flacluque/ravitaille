import type { ReactNode } from 'react';
import { BottleIcon, HomeIcon, PersonIcon, RouteIcon } from './Icons';

/** Les quatre sections de l'appli sur téléphone. */
export type Section = 'accueil' | 'plan' | 'ravitos' | 'moi';

const SECTIONS: [Section, string, ReactNode][] = [
  ['accueil', 'Accueil', <HomeIcon key="h" />],
  ['plan', 'Plan', <RouteIcon key="p" />],
  ['ravitos', 'Ravitos', <BottleIcon key="r" />],
  ['moi', 'Moi', <PersonIcon key="m" />],
];

interface Props {
  /** Section de la page affichée (une sous-page de Moi allume Moi). */
  section: Section;
  hrefs: Record<Section, string>;
}

/**
 * Sur téléphone : la barre d'onglets d'une appli, à portée de pouce. Quatre vraies sections, rien de caché derrière
 * un « Plus » : la vue En course passe par l'accueil, le sac par Ravitos, le reste (Strava, références, analyse,
 * calcul) par Moi.
 */
export function MobileNav({ section, hrefs }: Props) {
  return (
    <nav className="mobile-nav no-print" aria-label="Sections">
      {SECTIONS.map(([id, label, icon]) => (
        <a key={id} href={hrefs[id]} aria-current={section === id ? 'page' : undefined}>{icon}<span>{label}</span></a>
      ))}
    </nav>
  );
}
