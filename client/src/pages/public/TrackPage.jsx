/**
 * Token tracking for walk-in customers of one business (no account needed).
 * The service and token live in the URL, so a printed QR code can link straight to it.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import AuthLayout from '../auth/AuthLayout';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import StatusBadge from '../../components/ui/StatusBadge';
import QueueDots from '../../components/queue/QueueDots';
import { BusinessAPI, PublicAPI, errorMessage } from '../../lib/api';
import { minutesLabel } from '../../lib/format';

const REFRESH_MS = 10000;
const FINISHED = {
  COMPLETED: "You've been seen — thanks for waiting.",
  SKIPPED: 'This token was skipped. Please speak to the team.',
  CANCELLED: 'This token was cancelled.',
};

export default function TrackPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(null);
  const [form, setForm] = useState({ serviceId: params.get('service') || '', token: params.get('token') || '' });
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const service = params.get('service');
  const token = params.get('token');

  useEffect(() => {
    BusinessAPI.page(slug).then(setPage).catch((err) => setError(errorMessage(err)));
  }, [slug]);

  // Look up (and keep refreshing) whatever token is in the URL.
  useEffect(() => {
    if (!service || !token) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const e = await PublicAPI.track(slug, service, token);
        if (alive) {
          setEntry(e);
          setError('');
        }
      } catch (err) {
        if (alive) {
          setEntry(null);
          setError(errorMessage(err));
        }
      } finally {
        if (alive) setBusy(false);
      }
    };
    setBusy(true);
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug, service, token]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.serviceId || !form.token.trim()) {
      setError('Choose your service and enter the token number on your slip.');
      return;
    }
    setParams({ service: form.serviceId, token: form.token.trim().toUpperCase() });
  };

  const waiting = entry && ['WAITING', 'SERVING'].includes(entry.status);

  return (
    <AuthLayout
      title="Where am I in line?"
      subtitle={page ? `For walk-in customers at ${page.business.name} — no account needed.` : 'For walk-in customers — no account needed.'}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field id="track-service" label="Service">
          {(a) => (
            <select {...a} className="input" value={form.serviceId} onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}>
              <option value="">Choose a service</option>
              {(page?.services || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field id="track-token" label="Token number" hint="It's on the slip the team gave you, e.g. H025.">
          {(a) => <input {...a} className="input uppercase" autoComplete="off" value={form.token} onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" busy={busy}>Show my place</Button>
      </form>

      {error && <Alert tone="error" className="mt-6">{error}</Alert>}

      {entry && (
        <section aria-live="polite" className="card mt-6 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-ink-muted">{entry.serviceName} · {entry.serviceLocation}</p>
              <p className="token-numerals mt-1 text-7xl text-sage-deep">{entry.token}</p>
            </div>
            <StatusBadge status={entry.status} size="lg" />
          </div>
          {entry.status === 'SERVING' ? (
            <p className="mt-4 rounded-2xl bg-apricot-soft px-4 py-3 font-serif text-xl text-apricot-deep">It's your turn — please head to {entry.serviceLocation}.</p>
          ) : waiting ? (
            <div className="mt-4 space-y-4">
              <QueueDots ahead={entry.peopleAhead} />
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-sm text-ink-muted">Ahead of you</dt>
                  <dd className="token-numerals text-4xl">{entry.peopleAhead}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">About</dt>
                  <dd className="text-xl font-semibold">{minutesLabel(entry.estimatedWaitMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">Now serving</dt>
                  <dd className="token-numerals text-4xl text-apricot-deep">{entry.currentToken || '—'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="mt-4 text-ink-soft">{FINISHED[entry.status]}</p>
          )}
          {waiting && <p className="mt-4 text-xs text-ink-muted">This page refreshes every 10 seconds.</p>}
        </section>
      )}

      <p className="mt-8 text-sm text-ink-muted">
        Next time, skip the line: <Link to="/register" className="link">create a free account</Link> to join from your phone or book a time.
      </p>
    </AuthLayout>
  );
}
