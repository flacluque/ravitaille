import type { RacePlan } from '../api/types';
import { BackpackIcon, BarrierIcon, BottleIcon, StopwatchIcon } from './Icons';
import { durationMinutes, formatClock, formatHm, formatKm, formatMeters } from '../lib/format';

interface Props {
  /** Plan affiché (l'exemple au premier passage), pour l'aperçu ; absent pendant le calcul. */
  plan: RacePlan | undefined;
  isExample: boolean;
  /** Ouvre le plan affiché dans l'aperçu (l'exemple au premier passage). */
  onOpenPlan: () => void;
  onMyRace: () => void;
  onAlgorithm: () => void;
  feedbackUrl: string | null;
}

const USES = [
  { icon: <StopwatchIcon size={26} />, title: 'Tes heures de passage', text: 'À chaque ravito et pointage, selon trois scénarios : optimiste, réaliste, prudent. Avec la nuit, les arrêts et la fatigue qui s\'accumule.' },
  { icon: <BarrierIcon size={26} />, title: 'Tes marges sur les barrières', text: 'Combien d\'avance tu as sur chaque barrière horaire, et la plus serrée en un coup d\'œil.' },
  { icon: <BottleIcon size={26} />, title: 'Ta nutrition, ravito par ravito', text: 'Quoi prendre et quand, selon tes produits, tes flasques et l\'endroit où t\'attend ton assistance.' },
  { icon: <BackpackIcon size={26} />, title: 'Ton sac', text: 'Le matériel obligatoire lu dans le règlement, à cocher la veille.' },
];

const STEPS = [
  { title: 'Ta course', text: 'Prends en photo le roadbook (ou charge son PDF) : l\'IA le recopie, tu relis. Ajoute la trace GPX si tu l\'as, pour la carte et le profil.' },
  { title: 'Tes références', text: 'Une ou plusieurs courses récentes avec leur temps, ou importe-les depuis Strava avec ta préparation des dernières semaines.' },
  { title: 'Ton plan', text: 'Heures de passage, marges, profil, carte. Change de scénario d\'un clic, ajuste tes références, recalcule.' },
  { title: 'Le jour J', text: 'Prépare tes ravitos et ton sac, télécharge le PDF à glisser dans ta poche, ou garde l\'appli : le dernier plan reste lisible sans réseau.' },
];

/** Page d'arrivée : à quoi sert Ravitaille et comment s'en servir. */
export function WelcomePage({ plan, isExample, onOpenPlan, onMyRace, onAlgorithm, feedbackUrl }: Props) {
  return (
    <article className="welcome">
      <section className="welcome-hero">
        <div className="welcome-pitch">
          <h1>Prépare ton trail, heure par heure.</h1>
          <p className="welcome-lead">
            Ravitaille calcule tes heures de passage à chaque ravito à partir de <strong>tes propres courses</strong>,
            te dit quelle marge tu as sur les barrières horaires, et prépare ta nutrition et ton sac.
          </p>
          <div className="welcome-cta">
            <button type="button" onClick={onMyRace}>Préparer ma course</button>
          </div>
          <p className="muted small">Gratuit, sans compte : tout reste dans ton navigateur.</p>
        </div>
        <PlanPreview plan={plan} isExample={isExample} onOpen={onOpenPlan} />
      </section>

      <section aria-labelledby="welcome-uses">
        <h2 id="welcome-uses">À quoi ça sert</h2>
        <ul className="welcome-uses">
          {USES.map((u) => (
            <li key={u.title}>
              <span className="welcome-icon">{u.icon}</span>
              <div>
                <h3>{u.title}</h3>
                <p>{u.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="welcome-steps">
        <h2 id="welcome-steps">Comment s'en servir</h2>
        <ol className="welcome-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="welcome-step-n" aria-hidden>{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="welcome-cta">
          <button type="button" onClick={onMyRace}>Commencer avec ma course</button>
        </div>
      </section>

      <section className="welcome-more" aria-labelledby="welcome-more">
        <h2 id="welcome-more" className="sr-only">Bon à savoir</h2>
        <div className="card">
          <h3>Comment c'est calculé ?</h3>
          <p>
            Pas de moyenne générique : le calcul part de tes temps, convertis en kilomètres-effort (le D+ compte),
            avec la fatigue qui croît sur la durée et ta forme du moment si tu connectes Strava.
          </p>
          <button type="button" className="link-btn" onClick={onAlgorithm}>Le détail du calcul et ses sources</button>
        </div>
        <div className="card">
          <h3>Tes données</h3>
          <p>
            Tes courses, références et réglages sont gardés dans ton navigateur. Strava se connecte en lecture seule
            et se déconnecte d'un clic. Un roadbook lu par l'IA est envoyé à Gemini (Google) le temps de la lecture ;
            Ravitaille n'en garde rien. <a href="#confidentialite">Confidentialité</a>
          </p>
        </div>
        <div className="card">
          <h3>Le site est en test</h3>
          <p>Un bug, une idée, une course où le plan s'est trompé ? Ça aide beaucoup à l'améliorer.</p>
          {feedbackUrl && <a className="link-btn" href={feedbackUrl} target="_blank" rel="noreferrer">Donner mon avis</a>}
        </div>
      </section>
    </article>
  );
}

/** Extrait du plan affiché : ce que le coureur obtiendra. */
function PlanPreview({ plan, isExample, onOpen }: { plan: RacePlan | undefined; isExample: boolean; onOpen: () => void }) {
  if (!plan) {
    return <div className="welcome-preview card" aria-hidden><p className="muted">{isExample ? "Calcul de l'exemple…" : 'Ton plan apparaîtra ici une fois ta course saisie.'}</p></div>;
  }
  const points = plan.checkpoints;
  const rows = points.length <= 5 ? points : [...points.slice(1, 4), points[points.length - 1]];
  const tightest = points.filter((c) => c.marginIn || c.marginOut)
    .map((c) => ({ c, m: durationMinutes((c.marginIn ?? c.marginOut)!) }))
    .sort((a, b) => a.m - b.m)[0];
  return (
    <figure className="welcome-preview card">
      <figcaption className="muted small">{isExample ? 'Exemple' : 'Ta course'} · {plan.raceName}</figcaption>
      <div className="welcome-preview-hero">
        <span className="muted small">Arrivée prévue · scénario {plan.scenario.name.toLowerCase()}</span>
        <strong>{formatClock(plan.finish)}</strong>
        <span className="small">{formatHm(durationMinutes(plan.totalDuration))} de course · {formatKm(plan.totalDistanceKm)} km · {formatMeters(plan.totalGainM)} D+</span>
      </div>
      <table>
        <tbody>
          {rows.map((c) => (
            <tr key={c.code + c.km}>
              <td>{c.name}</td>
              <td className="num muted">{formatKm(c.km)} km</td>
              <td className="num"><strong>{formatClock(c.arrival)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      {tightest && (
        <p className="small welcome-tight">
          Barrière la plus serrée : <strong>{tightest.c.name}</strong>, {formatHm(tightest.m)} de marge
        </p>
      )}
      <button type="button" className="link-btn" onClick={onOpen}>Voir le plan complet</button>
    </figure>
  );
}
