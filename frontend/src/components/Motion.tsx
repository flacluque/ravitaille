import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Transitions de transitions.dev (skill transitions-dev), portées en React. Le CSS est dans styles.css (« Transitions »),
 * avec ses jetons de mouvement ; chaque transition s'arrête quand l'appareil demande moins d'animations.
 */

/**
 * Durée d'un jeton en millisecondes. Le CSS de production réécrit « 150ms » en « .15s » : on lit l'unité, sinon une
 * fenêtre se fermerait au bout de 0,15 ms.
 */
export function ms(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith('ms') ? value : raw.endsWith('s') ? value * 1000 : value;
}

/**
 * Tabs sliding (16) : la pastille `.t-tabs-pill` du conteneur glisse jusqu'au choix actif (aria-pressed ou
 * aria-current). Au premier affichage et au redimensionnement, elle s'y place sans animation.
 */
export function useSlidingPill(bar: RefObject<HTMLElement | null>, active: unknown) {
  const placed = useRef(false);
  useLayoutEffect(() => {
    const el = bar.current;
    const pill = el?.querySelector<HTMLElement>('.t-tabs-pill');
    if (!el || !pill) return;
    const moveTo = (animate: boolean) => {
      const tab = el.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"]');
      if (!tab) return;
      if (!animate) {
        const prev = pill.style.transition;
        pill.style.transition = 'none';
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
        void pill.offsetWidth;
        pill.style.transition = prev;
      } else {
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
      }
    };
    moveTo(placed.current);
    placed.current = true;
    const onResize = () => moveTo(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bar, active]);
}

/**
 * Text swap soft (34) : quand la valeur change (autre scénario), l'ancienne s'efface dans un léger flou pendant que
 * la nouvelle apparaît, au même endroit ; la largeur suit en douceur.
 */
export function SoftText({ value, className }: { value: string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);
  // Le texte appartient au DOM, pas à React : React ne réécrit jamais l'intérieur pendant un fondu.
  useLayoutEffect(() => {
    if (el.current && shown.current === null) {
      el.current.textContent = value;
      shown.current = value;
    }
  }, [value]);
  useEffect(() => {
    const node = el.current;
    if (!node || shown.current === value) return;
    const prev = shown.current ?? value;
    shown.current = value;
    const timer = (node as HTMLSpanElement & { _softTimer?: number })._softTimer;
    window.clearTimeout(timer);

    const out = document.createElement('span');
    out.className = 't-text-soft-old';
    out.setAttribute('aria-hidden', 'true');
    out.textContent = prev;
    const inn = document.createElement('span');
    inn.className = 't-text-soft-new';
    inn.textContent = value;

    const w0 = node.getBoundingClientRect().width;
    node.classList.remove('is-swapping');
    node.replaceChildren(out, inn);
    const w1 = inn.getBoundingClientRect().width;
    node.style.width = `${w0}px`;
    void node.offsetWidth; // reflow : chaque transition part bien
    node.classList.add('is-swapping');
    node.style.width = `${w1}px`;

    (node as HTMLSpanElement & { _softTimer?: number })._softTimer = window.setTimeout(() => {
      node.classList.remove('is-swapping');
      node.style.removeProperty('width');
      node.textContent = shown.current ?? value;
    }, Math.max(ms('--text-soft-dur'), ms('--text-soft-resize-dur')) + 40);
  }, [value]);
  return <span ref={el} className={`t-text-soft${className ? ` ${className}` : ''}`} />;
}

/**
 * Page side-by-side (08), pour une page qu'on ouvre ou qu'on referme : la page qui arrive vient de la droite (on
 * avance) ou de la gauche (on revient), dans un léger flou. Jouée par l'API d'animation du navigateur, avec des
 * valeurs calculées ici : Safari (iPhone) ignorait l'animation CSS, dont le décalage passait par une variable CSS
 * dans les @keyframes.
 */
export function playPageIn(el: HTMLElement | null, direction: 'forward' | 'back') {
  if (!el || typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = getComputedStyle(document.documentElement);
  const distance = parseFloat(root.getPropertyValue('--page-slide-distance')) || 8;
  const blur = parseFloat(root.getPropertyValue('--page-blur')) || 3;
  const from = direction === 'forward' ? distance : -distance;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([
    { opacity: 0, transform: `translateX(${from}px)`, filter: `blur(${blur}px)` },
    { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
  ], {
    duration: ms('--page-slide-dur') || 250,
    easing: root.getPropertyValue('--page-slide-ease').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)',
  });
}

/** Modal (06) : délai de fermeture, lu dans les jetons pour rester en phase avec le CSS. */
export function modalCloseMs(): number {
  return ms('--modal-close-dur') || 150;
}
