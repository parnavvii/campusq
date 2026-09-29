/** Accessible confirmation built on the native <dialog> element (focus trap + Esc for free). */
import Modal from './Modal';
import Button from './Button';

export default function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Keep it', tone = 'danger', busy, onConfirm, onCancel }) {
  return (
    <Modal open={open} title={title} onClose={onCancel} width="26rem">
      <div className="text-ink-muted">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant={tone} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
