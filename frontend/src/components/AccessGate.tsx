import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { enterAccessCode, fetchAppInfo, type AppInfo } from '../api/client';

/**
 * Écran du code d'invitation, quand le site en ligne en demande un. Sans réseau (appli installée,
 * le jour de la course), on laisse passer : le dernier plan est gardé hors ligne.
 */
export function AccessGate({ children }: { children: (info: AppInfo | null) => ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchAppInfo().then(setInfo, () => setInfo(null)).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  if (!info || !info.accessRequired || info.accessGranted) return <>{children(info)}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await enterAccessCode(code);
      setInfo((i) => i && { ...i, accessGranted: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="access-gate">
      <form className="card form" onSubmit={(e) => void submit(e)}>
        <div className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>Trail Planner</span>
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
