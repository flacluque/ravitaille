import { useCallback, useEffect, useRef, useState } from 'react';

interface Entry {
  label: string;
  restore: () => void;
}

const DELAY_MS = 8000;

/** Suppression réversible : la dernière suppression peut être annulée pendant quelques secondes. */
export function useUndo() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const timer = useRef<number>();
  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setEntry(null);
  }, []);
  const offer = useCallback((label: string, restore: () => void) => {
    window.clearTimeout(timer.current);
    setEntry({ label, restore });
    timer.current = window.setTimeout(() => setEntry(null), DELAY_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const undo = useCallback(() => {
    entry?.restore();
    dismiss();
  }, [entry, dismiss]);
  return { entry, offer, undo, dismiss };
}

/** Barre « … retiré · Annuler » en bas de l'écran. */
export function UndoToast({ undo }: { undo: ReturnType<typeof useUndo> }) {
  return (
    <div className="undo-toast no-print" role="status" aria-live="polite" hidden={!undo.entry}>
      {undo.entry && <>
        <span>{undo.entry.label}</span>
        <button type="button" className="link-btn" onClick={undo.undo}>Annuler</button>
        <button type="button" className="ghost icon-btn" onClick={undo.dismiss} aria-label="Fermer">✕</button>
      </>}
    </div>
  );
}
