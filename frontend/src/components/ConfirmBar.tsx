/**
 * Confirmation affichée dans la page, à la place de window.confirm : un navigateur peut bloquer
 * les boîtes de dialogue (« Empêcher cette page de créer d'autres dialogues »), et confirm()
 * répond alors « non » sans rien montrer.
 */
export function ConfirmBar({ message, confirmLabel, onConfirm, onCancel }: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-bar" role="alertdialog" aria-label={message}>
      <span>{message}</span>
      <span className="confirm-actions">
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
      </span>
    </div>
  );
}
