import { useEffect, useState } from 'react';
import { launchDone, launchShown } from '../api/native';

/** Durées de l'ouverture (ms) : la trace se dessine, on la laisse lire, puis l'écran s'efface sur l'appli. */
const DRAW = 900;
const HOLD = 900;
const FADE = 550;

/**
 * Ouverture de l'appli : la copie exacte de l'écran de lancement d'iOS (montagne et nom sur le vert), où la trace
 * orange se dessine avant que l'écran ne s'efface sur l'accueil. Les tailles suivent celles de l'image de lancement
 * (2732 px de côté, à la hauteur de l'écran) pour que le passage de l'une à l'autre ne se voie pas.
 */
export function LaunchIntro() {
  const [phase, setPhase] = useState<'draw' | 'fade' | 'gone'>('draw');
  useEffect(() => {
    let alive = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    // Le nom s'écrit dans la police de l'appli : on attend qu'elle soit prête avant de retirer l'écran natif.
    const font = document.fonts?.load('800 48px "Barlow Semi Condensed"').catch(() => undefined) ?? Promise.resolve();
    void Promise.race([font, new Promise((r) => setTimeout(r, 800))]).then(() => {
      if (!alive) return;
      requestAnimationFrame(() => {
        void launchShown();
        timers.push(window.setTimeout(() => setPhase('fade'), reduce ? 700 : DRAW + HOLD));
        timers.push(window.setTimeout(() => { setPhase('gone'); void launchDone(); }, (reduce ? 700 : DRAW + HOLD) + FADE));
      });
    });
    return () => { alive = false; timers.forEach((t) => window.clearTimeout(t)); };
  }, []);
  if (phase === 'gone') return null;
  return (
    <div className={`launch launch-${phase}`} aria-hidden>
      <div className="launch-mark">
        <svg viewBox="0 0 64 64">
          <path d="M6 50 L22 26 L30 36 L40 18 L58 50 Z" fill="#f6f4ef" />
          <path d="M40 18 L46 29 L42 27 L38 31 L35 27 Z" fill="#1f4d3a" opacity=".35" />
          <path className="launch-trace" d="M10 54 C 22 46, 30 52, 42 44 S 54 40, 58 38" pathLength={1} stroke="#e8893a"
            strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </svg>
        <span className="launch-name">Ravitaille</span>
      </div>
    </div>
  );
}
