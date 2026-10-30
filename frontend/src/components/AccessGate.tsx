import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { enterAccessCode, fetchAppInfo, humanError, type AppInfo } from '../api/client';

/** Le code a déjà été accepté sur cet appareil : on ouvre l'appli sans attendre le serveur. */
const GRANTED_KEY = 'trail-planner:acces-ok';
/** Sans réponse du serveur au bout de ce délai (ms), on dit qu'il se réveille plutôt que de laisser l'écran vide. */
const WAKING_AFTER = 1500;

function remembered(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) === '1';
  } catch {
    return false;
  }
}

function remember(granted: boolean): void {
  try {
    if (granted) localStorage.setItem(GRANTED_KEY, '1');
    else localStorage.removeItem(GRANTED_KEY);
  } catch {
    // stockage indisponible : on redemandera au serveur
  }
}

/**
 * Écran du code d'invitation, quand le site en ligne en demande un. Sans réseau (appli installée,
 * le jour de la course), on laisse passer : le dernier plan est gardé hors ligne.
 * <p>
 * Le serveur gratuit s'endort et met jusqu'à une minute à se réveiller : un appareil où le code a déjà été accepté
 * ouvre l'appli tout de suite (le dernier plan s'affiche, le calcul suit au réveil du serveur) ; la vérification se
 * fait en arrière-plan, et l'écran du code ne revient que si le code a changé.
 */
export function AccessGate({ children }: { children: (info: AppInfo | null) => ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [trusted] = useState(remembered);
  const [waking, setWaking] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaking(true), WAKING_AFTER);
    fetchAppInfo()
      .then((i) => {
        setInfo(i);
        remember(!i.accessRequired || i.accessGranted);
      }, () => setInfo(null))
      .finally(() => { setLoaded(true); window.clearTimeout(timer); });
    return () => window.clearTimeout(timer);
  }, []);

  if (!loaded && trusted) return <>{children(null)}</>;
  if (!loaded) {
    return waking ? (
      <main className="access-gate" role="status">
        <div className="waking">
          <img src="/icon.svg" alt="" width={48} height={48} />
          <span className="spinner" aria-hidden />
          <p>Connexion au serveur… S'il dormait, il met jusqu'à une minute à se réveiller.</p>
        </div>
      </main>
    ) : null;
  }
  if (!info || !info.accessRequired || info.accessGranted) return <>{children(info)}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await enterAccessCode(code);
      remember(true);
      setInfo((i) => i && { ...i, accessGranted: true });
    } catch (err) {
      setError(humanError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="access-gate">
      <form className="card form" onSubmit={(e) => void submit(e)}>
        <div className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>Ravitaille</span>
        </div>
        <p>Le site est en test entre amis : entre le code d'invitation qu'on t'a donné.</p>
        <label>
          Code d'invitation
          <input value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" required />
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button type="submit" disabled={sending || !code.trim()}>{sending ? 'Vérification…' : 'Entrer'}</button>
      </form>
    </main>
  );
}
