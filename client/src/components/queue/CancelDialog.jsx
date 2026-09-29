import ConfirmDialog from '../ui/ConfirmDialog';

export default function CancelDialog({ target, busy, onConfirm, onClose }) {
  return (
    <ConfirmDialog
      open={Boolean(target)}
      title={target ? `Leave the queue and give up ${target.token}?` : ''}
      confirmLabel="Leave queue"
      cancelLabel="Keep my token"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onClose}
    >
      {target && <>If you join {target.serviceName} again you will get a new token at the back of the queue.</>}
    </ConfirmDialog>
  );
}
