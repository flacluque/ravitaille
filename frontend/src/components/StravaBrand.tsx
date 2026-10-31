import { useState } from 'react';
import { connectStrava } from '../api/native';

/**
 * Marques Strava, selon les règles de Strava (developers.strava.com/guidelines) :
 * - la connexion part toujours du bouton officiel « Connect with Strava », tel quel (48 px de haut) ;
 * - ce qui montre des données Strava porte le logo officiel « Powered by Strava », plus discret que la marque Ravitaille ;
 * - une activité renvoie vers Strava par un lien « View on Strava » (gras et souligné) ;
 * - jamais le logo de Strava comme icône, ni de bouton aux couleurs de Strava : Ravitaille n'est pas une appli Strava.
 * Les images officielles sont dans public/strava (voir son README) ; si l'une ne se charge pas, un texte sobre la remplace.
 */

const ASSETS = '/strava';

/** Bouton officiel « Connect with Strava » : ouvre la page d'autorisation de Strava. */
export function ConnectWithStrava({ variant = 'orange', onClick = connectStrava }: { variant?: 'orange' | 'white'; onClick?: () => void }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return <button type="button" className="strava-connect-btn" onClick={onClick}>Connect with Strava</button>;
  }
  return (
    <button type="button" className="strava-connect-btn official" onClick={onClick} aria-label="Connect with Strava">
      <img src={`${ASSETS}/connect-with-strava-${variant}.svg`} alt="" height={48} onError={() => setMissing(true)} />
    </button>
  );
}

/** Logo officiel « Powered by Strava », sous les données qui viennent de Strava. */
export function PoweredByStrava() {
  const [missing, setMissing] = useState(false);
  return (
    <p className="powered-by-strava">
      {missing ? <span>Powered by Strava</span> : (
        <picture>
          <source srcSet={`${ASSETS}/powered-by-strava-white.svg`} media="(prefers-color-scheme: dark)" />
          <img src={`${ASSETS}/powered-by-strava-orange.svg`} alt="Powered by Strava" height={20} onError={() => setMissing(true)} />
        </picture>
      )}
    </p>
  );
}

/** Lien vers l'activité sur Strava. */
export function ViewOnStrava({ id }: { id: number }) {
  return (
    <a className="view-on-strava" href={`https://www.strava.com/activities/${id}`} target="_blank" rel="noreferrer">
      View on Strava
    </a>
  );
}
