import type { CiqPlan } from '../lib/ciq';

/** « 13h38 » à partir de minutes depuis minuit. */
function clock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

const EXAMPLE_KM = 4.2;
const EXAMPLE_GAP = 12;

/**
 * Ce que montre le champ Prochain Ravito sur une montre ronde (même mise en page que le champ, connectiq/), avec un
 * ravito du plan : à 4,2 km du ravito, 12 min de retard. En plein écran, et dans un écran à 2 champs.
 */
export function WatchFieldPreview({ plan }: { plan: CiqPlan }) {
  const rs = plan.ravitos;
  if (rs.length < 2) return null;
  const i = Math.min(2, rs.length - 1);
  const r = rs[i];
  const dist = Math.max(0.5, Math.min(EXAMPLE_KM, r.km - rs[i - 1].km - 0.3));
  const planned = plan.startClock + r.arr;
  const km = dist.toFixed(1).replace('.', ',');
  return (
    <figure className="watch-preview">
      <div className="watch-faces">
        <div className="watch-face" role="img"
          aria-label={`Champ seul : prochain ravito ${r.name}, ${km} km, arrivée estimée ${clock(planned + EXAMPLE_GAP)}, prévu ${clock(planned)}, ${EXAMPLE_GAP} minutes de retard`}>
          <div className="watch-screen watch-full" aria-hidden>
            <span className="w-label">PROCHAIN RAVITO</span>
            <span className="w-name">{r.name}</span>
            <span className="w-row"><span className="w-dist">{km}</span><span className="w-eta">{clock(planned + EXAMPLE_GAP)}</span></span>
            <span className="w-row w-legend"><span>km</span><span>estimée</span></span>
            <span className="w-planned">prévu {clock(planned)}</span>
            <span className="w-gap late">{EXAMPLE_GAP} min de retard</span>
          </div>
        </div>
        <div className="watch-face" role="img"
          aria-label={`Dans un écran à 2 champs : ${r.name} à ${km} km, arrivée estimée ${clock(planned + EXAMPLE_GAP)}, ${EXAMPLE_GAP} minutes de retard`}>
          <div className="watch-screen watch-compact" aria-hidden>
            <span className="w-half w-other"><span className="w-label">ALLURE</span><span className="w-big">8:42</span></span>
            <span className="w-half">
              <span className="w-line">{r.name} <span className="w-dist-s">{km}</span></span>
              <span className="w-line">{clock(planned + EXAMPLE_GAP)} <span className="late">+{EXAMPLE_GAP} min</span></span>
            </span>
          </div>
        </div>
      </div>
      <figcaption className="muted small">
        Exemple avec ton plan, à {km} km de {r.name} et {EXAMPLE_GAP} min de retard : seul sur un écran (à gauche), ou à
        côté de tes autres champs (à droite).
      </figcaption>
    </figure>
  );
}
