/** Admin: the business's details, booking rules and the links to share with customers. */
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Spinner from '../../components/ui/Spinner';
import { BusinessAPI, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { CATEGORIES } from '../../lib/brand';

function validate(f) {
  const int = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
  return {
    name: f.name.trim().length < 2 ? 'Enter the name customers know you by.' : '',
    bookingDaysAhead: !int(f.bookingDaysAhead, 0, 60) ? 'Enter 0 to 60 days.' : '',
    checkinEarlyMinutes: !int(f.checkinEarlyMinutes, 0, 240) ? 'Enter 0 to 240 minutes.' : '',
    noShowMinutes: !int(f.noShowMinutes, 0, 120) ? 'Enter 0 to 120 minutes.' : '',
  };
}

function ShareLink({ label, path, hint }) {
  const toast = useToast();
  const url = `${window.location.origin}${path}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper/70 px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="truncate text-sm text-ink-muted">{hint}</p>
        <a href={path} target="_blank" rel="noreferrer" className="link break-all text-sm">{url}</a>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
          } catch {
            toast.info('Copy this link', url);
          }
        }}
      >
        Copy
      </Button>
    </div>
  );
}

export default function BusinessSettingsPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Kolkata', 'UTC']), []);

  useEffect(() => {
    BusinessAPI.mine()
      .then((b) => {
        setBusiness(b);
        setForm({ ...b });
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!form) return error ? <Alert tone="error">{error}</Alert> : <Spinner />;
  const errors = validate(form);
  // Browsers list some zones under older names (e.g. Asia/Calcutta), so always offer the saved one.
  const zoneOptions = [...new Set([form.timezone, ...zones])];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setError('');
    try {
      const res = await BusinessAPI.updateMine({
        name: form.name.trim(),
        category: form.category,
        tagline: form.tagline.trim(),
        address: form.address.trim(),
        timezone: form.timezone,
        bookingDaysAhead: Number(form.bookingDaysAhead),
        checkinEarlyMinutes: Number(form.checkinEarlyMinutes),
        noShowMinutes: Number(form.noShowMinutes),
      });
      setBusiness(res.business);
      await refresh();
      toast.success('Saved', 'Customers see the new details straight away.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Business settings" description="How your business appears to customers, and the rules for bookings." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submit} noValidate className="space-y-6">
          {error && <Alert tone="error">{error}</Alert>}

          <section className="card space-y-5 p-6 sm:p-8">
            <h2 className="text-2xl">About your business</h2>
            <Field id="set-name" label="Business name" error={errors.name}>
              {(a) => <input {...a} className="input" value={form.name} onChange={set('name')} />}
            </Field>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-soft">Kind of place</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of business">
                {Object.entries(CATEGORIES).map(([key, c]) => (
                  <label key={key} className={`chip cursor-pointer px-4 py-2 ${form.category === key ? 'bg-sage-deep text-cream' : 'border border-line bg-cream text-ink-soft'}`}>
                    <input type="radio" name="category" value={key} checked={form.category === key} onChange={set('category')} className="sr-only" />
                    <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
                    {c.short}
                  </label>
                ))}
              </div>
            </div>
            <Field id="set-tagline" label="Short description" hint="Shown under your name, e.g. “Hair, beauty & grooming”.">
              {(a) => <input {...a} className="input" maxLength={200} value={form.tagline} onChange={set('tagline')} />}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="set-address" label="Address">
                {(a) => <input {...a} className="input" maxLength={200} value={form.address} onChange={set('address')} />}
              </Field>
              <Field id="set-tz" label="Timezone" hint="Opening hours, bookings and reports use this.">
                {(a) => (
                  <select {...a} className="input" value={form.timezone} onChange={set('timezone')}>
                    {zoneOptions.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </section>

          <section className="card space-y-5 p-6 sm:p-8">
            <h2 className="text-2xl">Booking rules</h2>
            <p className="text-sm text-ink-muted">Opening hours, appointment length and how many people fit in one time are set for each service.</p>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field id="set-days" label="Book ahead" hint="Days" error={errors.bookingDaysAhead}>
                {(a) => <input {...a} type="number" min="0" max="60" className="input" value={form.bookingDaysAhead} onChange={set('bookingDaysAhead')} />}
              </Field>
              <Field id="set-early" label="Check-in opens" hint="Minutes before" error={errors.checkinEarlyMinutes}>
                {(a) => <input {...a} type="number" min="0" max="240" className="input" value={form.checkinEarlyMinutes} onChange={set('checkinEarlyMinutes')} />}
              </Field>
              <Field id="set-grace" label="Missed after" hint="Minutes late" error={errors.noShowMinutes}>
                {(a) => <input {...a} type="number" min="0" max="120" className="input" value={form.noShowMinutes} onChange={set('noShowMinutes')} />}
              </Field>
            </div>
            <p className="text-sm text-ink-muted">
              Someone booked for 10:00 can check in from {Number(form.checkinEarlyMinutes) || 0} min before. If they haven't arrived {Number(form.noShowMinutes) || 0} min after the start, the booking is marked missed and their spot goes back to the queue.
            </p>
          </section>

          <div className="flex gap-2">
            <Button type="submit" busy={busy}>Save changes</Button>
            <Button variant="ghost" onClick={() => setForm({ ...business })} disabled={busy}>Undo</Button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="card space-y-4 p-6">
            <h2 className="text-2xl">Share with customers</h2>
            <ShareLink label="Your page" path={`/p/${business.slug}`} hint="Customers join the queue or book a time here." />
            <ShareLink label="Waiting-room screen" path={`/p/${business.slug}/board`} hint="Open this full-screen on a TV." />
            <ShareLink label="Walk-in tracking" path={`/p/${business.slug}/track`} hint="For people without an account." />
          </section>
        </aside>
      </div>
    </>
  );
}
