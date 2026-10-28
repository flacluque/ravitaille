import { useState } from 'react';
import { StravaLogo } from './StravaLogo';

interface Props {
  /** Voir le plan d'exemple. */
  onExample: () => void;
  /** Connecter Strava, puis importer ses courses. */
  onStrava: () => void;
  /** Saisir ses courses à la main. */
  onManual: () => void;
  /** Passer : saisir sa course d'abord, le plan suit la course d'exemple. */
  onLater: () => void;
}

/**
 * Premier lancement sur téléphone : ce que fait l'appli, puis ton rythme (Strava d'abord). Ensuite, la saisie de la
 * course ou l'exemple.
 */
export function Onboarding({ onExample, onStrava, onManual, onLater }: Props) {
  const [step, setStep] = useState<'welcome' | 'rythme'>('welcome');
  return (
    <div className="onboarding">
      <div className="onb-steps" aria-hidden><i className="on" /><i className={step === 'rythme' ? 'on' : ''} /></div>
      {step === 'welcome' ? (
        <>
          <div className="onb-body">
            <img src="/icon.svg" alt="" width={64} height={64} />
            <h1>Tes heures de passage, à ton rythme.</h1>
            <p>Ravitaille calcule ton arrivée à chaque ravito à partir de tes propres courses, et prépare ta nutrition, ton sac
              et ta montre.</p>
          </div>
          <div className="onb-actions">
            <button type="button" className="big-btn" onClick={() => setStep('rythme')}>Préparer ma course</button>
            <button type="button" className="big-btn ghost" onClick={onExample}>Voir un exemple</button>
          </div>
        </>
      ) : (
        <>
          <div className="onb-body">
            <button type="button" className="onb-back" onClick={() => setStep('welcome')}>Retour</button>
            <h1>Tes courses font ton plan.</h1>
            <p>Connecte Strava : tes courses et sorties longues de l'année deviennent tes références, et ton rythme en montée et
              en descente est mesuré. Lecture seule, déconnexion en un geste.</p>
          </div>
          <div className="onb-actions">
            <button type="button" className="big-btn strava" onClick={onStrava}><StravaLogo size={18} /> Connecter Strava</button>
            <button type="button" className="big-btn ghost" onClick={onManual}>Saisir une course à la main</button>
            <button type="button" className="link-btn onb-later" onClick={onLater}>Plus tard : saisir ma course d'abord</button>
          </div>
        </>
      )}
    </div>
  );
}
