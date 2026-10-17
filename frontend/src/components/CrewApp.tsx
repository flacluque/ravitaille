import { useEffect, useState } from 'react';
import { decodeShare, type CrewShare } from '../lib/crew';
import { CrewView } from './CrewView';

/** Entrée de l'assistance : le lien #assistance=… se décode ici, sans compte ni code d'invitation. */
export function CrewApp() {
  const [share, setShare] = useState<CrewShare | null | undefined>(undefined);
  useEffect(() => {
    const read = () => void decodeShare(window.location.hash).then(setShare);
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  useEffect(() => {
    if (share) document.title = `Assistance · ${share.race}`;
  }, [share]);

  if (share === undefined) return null;
  if (share === null) {
    return (
      <main className="crew-broken">
        <h1>Lien incomplet</h1>
        <p>Ce lien d'assistance est abîmé (souvent coupé par une messagerie). Demande au coureur de te le renvoyer par mail ou
          WhatsApp, puis ouvre-le en entier.</p>
      </main>
    );
  }
  return <CrewView share={share} />;
}
