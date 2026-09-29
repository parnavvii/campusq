/** Admin: create and edit services — status, booking hours and slots, and which staff run them. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import StatusBadge from '../../components/ui/StatusBadge';
import { AuthAPI, ServiceAPI, errorMessage } from '../../lib/api';
import { useServices } from '../../hooks/useCustomerQueue';
import { useToast } from '../../context/ToastContext';
import { hhmmLabel } from '../../lib/format';

const EMPTY = {
  name: '', location: '', tokenPrefix: '', avgServiceMinutes: 10, status: 'ACTIVE', staffIds: [],
  bookingEnabled: true, openTime: '09:00', closeTime: '17:00', slotMinutes: 15, slotCapacity: 1,
};

const toMinutes = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};

function validate(f) {
  return {
    name: f.name.trim().length < 2 ? 'Enter a service name (2–100 characters).' : '',
    location: f.location.trim().length < 2 ? 'Enter where customers go when called.' : '',
    tokenPrefix: !/^[A-Za-z]{1,3}$/.test(f.tokenPrefix.trim()) ? 'Use 1–3 letters, e.g. A.' : '',
    avgServiceMinutes: !(Number(f.avgServiceMinutes) >= 0.5 && Number(f.avgServiceMinutes) <= 240) ? 'Enter 0.5 to 240 minutes.' : '',
    slotMinutes: f.bookingEnabled && !(Number.isInteger(Number(f.slotMinutes)) && f.slotMinutes >= 5 && f.slotMinutes <= 240) ? 'Enter 5 to 240 minutes.' : '',
    slotCapacity: f.bookingEnabled && !(Number.isInteger(Number(f.slotCapacity)) && f.slotCapacity >= 1 && f.slotCapacity <= 50) ? 'Enter 1 to 50.' : '',
    closeTime:
      !f.openTime || !f.closeTime
        ? 'Enter opening and closing times.'
        : toMinutes(f.closeTime) - toMinutes(f.openTime) < Number(f.slotMinutes || 0)
          ? 'Closing time must be after opening time, with room for at least one slot.'
          : '',
  };
}

function ServiceForm({ initial, staff, onSaved, onCancel }) {
  const toast = useToast();
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name,
          location: initial.location,
          tokenPrefix: initial.tokenPrefix,
          avgServiceMinutes: initial.defaultServiceMinutes,
          status: initial.status,
          staffIds: (initial.assignedStaff || []).map((s) => s.id),
          bookingEnabled: initial.booking.enabled,
          openTime: initial.booking.openTime,
          closeTime: initial.booking.closeTime === '24:00' ? '23:59' : initial.booking.closeTime,
          slotMinutes: initial.booking.slotMinutes,
          slotCapacity: initial.booking.slotCapacity,
        }
      : EMPTY
  );
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = validate(form);
  const show = (k) => touched[k] && errors[k];

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, location: true, tokenPrefix: true, avgServiceMinutes: true, slotMinutes: true, slotCapacity: true, closeTime: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setServerError('');
    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      tokenPrefix: form.tokenPrefix.trim().toUpperCase(),
      avgServiceMinutes: Number(form.avgServiceMinutes),
      staffIds: form.staffIds,
      bookingEnabled: form.bookingEnabled,
      openTime: form.openTime,
      closeTime: form.closeTime,
      slotMinutes: Number(form.slotMinutes),
      slotCapacity: Number(form.slotCapacity),
      ...(editing ? { status: form.status } : {}),
    };
    try {
      const res = editing ? await ServiceAPI.update(initial.id, payload) : await ServiceAPI.create(payload);
      toast.success(editing ? 'Service saved' : 'Service created', res.service.name);
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate method="post" className="card space-y-6 p-6 sm:p-8">
      <h2 className="font-serif text-2xl">{editing ? `Edit ${initial.name}` : 'Add a service'}</h2>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <Field id="svc-name" label="Service name" error={show('name')}>
        {(a) => <input {...a} className="input" value={form.name} onChange={set('name')} onBlur={blur('name')} />}
      </Field>
      <Field id="svc-location" label="Location" hint="Where customers go when called, e.g. Chair 2, Room 3, Counter 1." error={show('location')}>
        {(a) => <input {...a} className="input" value={form.location} onChange={set('location')} onBlur={blur('location')} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="svc-prefix" label="Token prefix" hint="Tokens look like A001." error={show('tokenPrefix')}>
          {(a) => (
            <input {...a} className="input uppercase" maxLength={3} autoCapitalize="characters" value={form.tokenPrefix} onChange={set('tokenPrefix')} onBlur={blur('tokenPrefix')} />
          )}
        </Field>
        <Field id="svc-avg" label="Default minutes per customer" hint="Used until real history exists." error={show('avgServiceMinutes')}>
          {(a) => (
            <input {...a} type="number" min="0.5" max="240" step="0.5" inputMode="decimal" className="input" value={form.avgServiceMinutes} onChange={set('avgServiceMinutes')} onBlur={blur('avgServiceMinutes')} />
          )}
        </Field>
      </div>

      {editing && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Status</legend>
          <div className="flex flex-wrap gap-4">
            {['ACTIVE', 'PAUSED', 'CLOSED'].map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="radio" name="status" value={s} checked={form.status === s} onChange={set('status')} className="h-4 w-4 accent-sage-deep" />
                {{ ACTIVE: 'Open', PAUSED: 'Paused', CLOSED: 'Closed' }[s]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="rounded-3xl bg-paper/70 p-5">
        <legend className="px-1 text-sm font-semibold">Opening hours &amp; bookings</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="svc-open" label="Opens at" hint="Local time at the centre.">
            {(a) => <input {...a} type="time" className="input" value={form.openTime} onChange={set('openTime')} onBlur={blur('closeTime')} />}
          </Field>
          <Field id="svc-close" label="Closes at" error={show('closeTime')}>
            {(a) => <input {...a} type="time" className="input" value={form.closeTime} onChange={set('closeTime')} onBlur={blur('closeTime')} />}
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-sage-deep"
            checked={form.bookingEnabled}
            onChange={(e) => setForm((f) => ({ ...f, bookingEnabled: e.target.checked }))}
          />
          Customers can book time slots
        </label>
        {form.bookingEnabled && (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field id="svc-slot" label="Slot length (minutes)" hint="e.g. 15 for a quick service, 60 for a long one." error={show('slotMinutes')}>
              {(a) => <input {...a} type="number" min="5" max="240" step="5" inputMode="numeric" className="input" value={form.slotMinutes} onChange={set('slotMinutes')} onBlur={blur('slotMinutes')} />}
            </Field>
            <Field id="svc-capacity" label="Customers per slot" hint="How many people can book the same slot." error={show('slotCapacity')}>
              {(a) => <input {...a} type="number" min="1" max="50" inputMode="numeric" className="input" value={form.slotCapacity} onChange={set('slotCapacity')} onBlur={blur('slotCapacity')} />}
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Assigned staff</legend>
        {staff.length ? (
          <div className="space-y-2">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sage-deep"
                  checked={form.staffIds.includes(s.id)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, staffIds: e.target.checked ? [...f.staffIds, s.id] : f.staffIds.filter((id) => id !== s.id) }))
                  }
                />
                {s.name} <span className="text-sm text-ink-muted">{s.email}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No team members yet. <Link to="/admin/staff" className="link">Add someone</Link>
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy}>{editing ? 'Save changes' : 'Create service'}</Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ManageServicesPage() {
  const services = useServices();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const [staff, setStaff] = useState([]);
  // A brand-new business lands here with the form already open.
  const [editing, setEditing] = useState(welcome ? 'new' : null); // null | 'new' | service

  useEffect(() => {
    AuthAPI.staff().then(setStaff).catch(() => setStaff([]));
  }, []);

  const done = () => {
    setEditing(null);
    services.reload();
  };

  return (
    <>
      <PageHeader
        title="Services"
        description="The things people can queue or book for — each with its own hours, token letter and team."
        actions={!editing && <Button onClick={() => setEditing('new')}>Add a service</Button>}
      />
      {welcome && !services.loading && !services.data?.length && (
        <Alert tone="success" title="Welcome to Waitwell" className="mb-6">
          Add your first service — for example “Haircut”, “Consultation” or “Phone repair”. Customers can join its queue as soon as it's saved.
        </Alert>
      )}
      {editing && (
        <div className="mb-8">
          <ServiceForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} staff={staff} onSaved={done} onCancel={() => setEditing(null)} />
        </div>
      )}
      {services.loading ? (
        <Spinner />
      ) : services.error ? (
        <Alert tone="error">{services.error}</Alert>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left">
            <caption className="sr-only">Services</caption>
            <thead className="border-b border-line bg-paper/70 text-sm text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Service</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Prefix</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Hours &amp; bookings</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Staff</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Waiting</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Status</th>
                <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {services.data.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-ink-muted">{s.location}</p>
                  </td>
                  <td className="px-5 py-3 token-numerals text-2xl text-sage-deep">{s.tokenPrefix}</td>
                  <td className="px-5 py-3 text-sm">
                    <p>{hhmmLabel(s.booking.openTime)} – {hhmmLabel(s.booking.closeTime)}</p>
                    <p className="text-ink-muted">{s.booking.enabled ? `${s.booking.slotMinutes}-min slots · ${s.booking.slotCapacity} per slot` : 'Queue only'}</p>
                  </td>
                  <td className="px-5 py-3 text-sm">{s.assignedStaff?.length ? s.assignedStaff.map((x) => x.name).join(', ') : <span className="text-rose-deep">Unassigned</span>}</td>
                  <td className="px-5 py-3">{s.queueLength}</td>
                  <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(s)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
