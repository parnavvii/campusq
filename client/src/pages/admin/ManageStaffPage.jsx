/** Admin: create staff logins and see which services each staff member runs. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import EmptyState from '../../components/ui/EmptyState';
import { AuthAPI, errorMessage } from '../../lib/api';
import { dateTimeLabel } from '../../lib/format';
import { useLiveData } from '../../hooks/useLiveData';
import { useServices } from '../../hooks/useCustomerQueue';
import { useToast } from '../../context/ToastContext';

const EMPTY = { name: '', email: '', password: '', serviceIds: [] };

function validate(f) {
  return {
    name: f.name.trim().length < 2 ? 'Enter their full name (at least 2 characters).' : '',
    email: !/^\S+@\S+\.\S+$/.test(f.email.trim()) ? 'Enter a valid email address.' : '',
    password:
      f.password.length < 8
        ? 'Use at least 8 characters.'
        : !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)
          ? 'Include at least one letter and one number.'
          : '',
  };
}

function StaffForm({ services, onCreated, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = validate(form);
  const show = (k) => touched[k] && errors[k];

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setServerError('');
  };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setServerError('');
    try {
      const res = await AuthAPI.createStaff({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        serviceIds: form.serviceIds,
      });
      toast.success('Staff account created', res.staff.name);
      onCreated(res.staff);
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate method="post" className="card space-y-6 p-6 sm:p-8">
      <h2 className="font-serif text-2xl">Add a team member</h2>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="staff-name" label="Full name" error={show('name')}>
          {(a) => <input {...a} className="input" autoComplete="off" value={form.name} onChange={set('name')} onBlur={blur('name')} />}
        </Field>
        <Field id="staff-email" label="Email" hint="They'll use this to log in." error={show('email')}>
          {(a) => (
            <input {...a} type="email" inputMode="email" autoComplete="off" className="input" value={form.email} onChange={set('email')} onBlur={blur('email')} />
          )}
        </Field>
      </div>
      <Field id="staff-password" label="Temporary password" hint="At least 8 characters, with a letter and a number. Share it with them privately." error={show('password')}>
        {(a) => (
          <div className="flex gap-2">
            <input
              {...a}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="input min-w-0 flex-1"
              value={form.password}
              onChange={set('password')}
              onBlur={blur('password')}
            />
            <Button variant="outline" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword} aria-controls="staff-password">
              {showPassword ? 'Hide' : 'Show'}
            </Button>
          </div>
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Assign to services <span className="font-normal text-ink-muted">(optional)</span></legend>
        {services.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sage-deep"
                  checked={form.serviceIds.includes(s.id)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, serviceIds: e.target.checked ? [...f.serviceIds, s.id] : f.serviceIds.filter((id) => id !== s.id) }))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No services exist yet. You can assign this person later from Manage services.</p>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy}>Create staff account</Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ManageStaffPage() {
  // Assignments also change when a service is edited, so refresh on the same event.
  const staff = useLiveData(AuthAPI.staff, { events: ['services:changed'] });
  const services = useServices();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);

  const onCreated = (s) => {
    setAdding(false);
    setCreated(s);
    staff.reload();
  };

  return (
    <>
      <PageHeader
        title="Your team"
        description="Create logins for your team and choose which services each person runs."
        actions={
          !adding && (
            <Button
              onClick={() => {
                setCreated(null);
                setAdding(true);
              }}
            >
              Add a team member
            </Button>
          )
        }
      />

      {created && (
        <Alert tone="success" title={`${created.name} can now log in`} className="mb-6">
          They sign in on the <Link to="/staff/login" className="font-semibold underline underline-offset-4">staff login</Link> page with{' '}
          <strong>{created.email}</strong> and the temporary password you set.
          {!created.services.length && ' They have no services yet — assign some from Manage services.'}
        </Alert>
      )}

      {adding && (
        <div className="mb-8">
          <StaffForm services={services.data || []} onCreated={onCreated} onCancel={() => setAdding(false)} />
        </div>
      )}

      {staff.loading ? (
        <Spinner />
      ) : staff.error ? (
        <Alert tone="error">{staff.error}</Alert>
      ) : !staff.data.length ? (
        <EmptyState title="No staff accounts yet" action={!adding && <Button onClick={() => setAdding(true)}>Add staff</Button>}>
          Staff accounts let your team call customers, add walk-ins, check in bookings and see reports for the services you assign them.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Staff accounts</caption>
            <thead className="border-b border-line bg-paper/70 text-sm text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Name</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Email</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Services</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {staff.data.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-semibold">{s.name}</td>
                  <td className="px-5 py-3 text-sm">{s.email}</td>
                  <td className="px-5 py-3 text-sm">
                    {s.services.length ? s.services.map((x) => x.name).join(', ') : <span className="text-rose-deep">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3 text-sm text-ink-muted">{dateTimeLabel(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
