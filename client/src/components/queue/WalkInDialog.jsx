/** Staff issue a token to a customer standing at the desk — no account or phone needed. */
import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { QueueAPI, errorMessage } from '../../lib/api';
import { minutesLabel } from '../../lib/format';

export default function WalkInDialog({ open, service, businessSlug, onClose, onIssued }) {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({ name: '', phone: '' });
      setTouched(false);
      setError('');
      setIssued(null);
    }
  }, [open]);

  const nameError = form.name.trim().length < 2 ? "Enter the customer's name." : '';

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    setBusy(true);
    setError('');
    try {
      const { entry } = await QueueAPI.walkIn(service.id, { name: form.name.trim(), phone: form.phone.trim() || undefined });
      setIssued(entry);
      onIssued?.(entry);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const trackUrl = `${window.location.host}/p/${businessSlug}/track`;

  return (
    <Modal open={open} title={issued ? 'Token ready' : `Add a walk-in to ${service?.name || ''}`} onClose={onClose}>
      {issued ? (
        <div className="space-y-4">
          <div className="rounded-3xl bg-sage-deep p-6 text-cream">
            <p className="text-sm text-cream/70">Give this token to {form.name.trim()}</p>
            <p className="token-numerals mt-1 text-8xl text-butter">{issued.token}</p>
            <p className="mt-2 text-cream/85">
              {issued.peopleAhead} ahead · about {minutesLabel(issued.estimatedWaitMinutes)}
            </p>
          </div>
          <p className="text-sm text-ink-muted">
            They can follow their place on the waiting-room screen, or at <span className="font-semibold text-ink">{trackUrl}</span>.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIssued(null);
                setForm({ name: '', phone: '' });
                setTouched(false);
              }}
            >
              Add another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field id="walkin-name" label="Customer's name" error={touched && nameError}>
            {(a) => <input {...a} className="input" autoComplete="off" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />}
          </Field>
          <Field id="walkin-phone" label="Phone (optional)" hint="Only for staff, e.g. to call them back.">
            {(a) => <input {...a} className="input" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" busy={busy}>Issue token</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
