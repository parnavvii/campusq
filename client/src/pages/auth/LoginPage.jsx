/** One login for everyone — customers, staff and business owners. */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';
import { homeForRole } from '../../lib/format';

// Seeded demo accounts — shown only in development builds, never in production.
const DEMO = [
  ['Customers', [
    ['Rahul — new customer', 'rahul@waitwell.demo', 'Customer@123'],
    ['Karthik — already in a queue', 'karthik@waitwell.demo', 'Customer@123'],
  ]],
  ['Glow & Go Salon', [
    ['Rohit — owner', 'salon.admin@waitwell.demo', 'Team@1234'],
    ['Meera — staff', 'salon.staff1@waitwell.demo', 'Team@1234'],
  ]],
  ['Other businesses', [
    ['CityCare Family Clinic — owner', 'clinic.admin@waitwell.demo', 'Team@1234'],
    ['FixIt Hub — staff', 'repair.staff1@waitwell.demo', 'Team@1234'],
  ]],
];
const SHOW_DEMO = import.meta.env.DEV;

/** Only follow in-app paths after login (never an outside URL). */
const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null);

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next || homeForRole(user.role)} replace />;

  const errors = {
    email: !form.email.trim() ? 'Enter your email.' : !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? 'That email doesn’t look right.' : '',
    password: !form.password ? 'Enter your password.' : '',
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setServerError('');
    if (errors.email || errors.password) return;
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      const allowed = u.role === 'CUSTOMER' || !next || !next.startsWith('/p/') ? next : null;
      navigate(allowed || homeForRole(u.role), { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setServerError('');
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to join queues and manage bookings — or to run your business's line.">
      <form onSubmit={submit} noValidate className="space-y-5" method="post">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Field id="email" label="Email" error={touched.email && errors.email}>
          {(a) => (
            <input {...a} name="email" type="email" autoComplete="username" inputMode="email" className="input" value={form.email} onChange={onChange} onBlur={() => setTouched((t) => ({ ...t, email: true }))} />
          )}
        </Field>
        <Field id="password" label="Password" error={touched.password && errors.password}>
          {(a) => (
            <input {...a} name="password" type="password" autoComplete="current-password" className="input" value={form.password} onChange={onChange} onBlur={() => setTouched((t) => ({ ...t, password: true }))} />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" busy={busy}>Log in</Button>
      </form>

      <div className="mt-6 space-y-1.5 text-sm text-ink-muted">
        <p>New here? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">Create a free account</Link></p>
        <p>Run a salon, clinic or shop? <Link to="/business/new" className="link">List your business</Link></p>
      </div>

      {SHOW_DEMO && (
        <details className="mt-8 rounded-3xl bg-cream p-5 shadow-soft">
          <summary className="cursor-pointer font-semibold text-ink-soft">Demo accounts</summary>
          <div className="mt-4 space-y-4">
            {DEMO.map(([group, accounts]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group}</p>
                <ul className="space-y-2">
                  {accounts.map(([label, email, password]) => (
                    <li key={email}>
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ email, password });
                          setServerError('');
                        }}
                        className="w-full rounded-2xl bg-paper px-4 py-2.5 text-left text-sm hover:bg-sage-tint"
                      >
                        <span className="font-semibold">{label}</span>
                        <span className="block text-ink-muted">{email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </AuthLayout>
  );
}
