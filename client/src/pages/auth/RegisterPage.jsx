/** Customer sign-up: one account for every place on Waitwell. */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/api';
import { homeForRole } from '../../lib/format';

function validate(f) {
  return {
    name: f.name.trim().length < 2 ? 'Please tell us your name.' : '',
    email: !/^\S+@\S+\.\S+$/.test(f.email.trim()) ? 'That email doesn’t look right.' : '',
    phone: f.phone.trim() && !/^\+?[0-9][0-9 -]{6,18}[0-9]$/.test(f.phone.trim()) ? 'That number doesn’t look right — or leave it empty.' : '',
    password:
      f.password.length < 8
        ? 'Use at least 8 characters.'
        : !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)
          ? 'Include at least one letter and one number.'
          : '',
  };
}

export default function RegisterPage() {
  const { user, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeForRole(user.role)} replace />;

  const errors = validate(form);
  const show = (k) => touched[k] && errors[k];

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, password: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setServerError('');
    try {
      const u = await register({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, password: form.password });
      toast.success(`Welcome, ${u.name.split(' ')[0]}`, 'Find a place to join a queue or book a time.');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/explore', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  const bind = (name, extra = {}) => ({
    name,
    className: 'input',
    value: form[name],
    onChange: (e) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
      setServerError('');
    },
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    ...extra,
  });

  return (
    <AuthLayout title="Create your account" subtitle="One account for every place on Waitwell. It's free.">
      <form onSubmit={submit} noValidate className="space-y-5" method="post">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Field id="name" label="Your name" error={show('name')}>
          {(a) => <input {...a} {...bind('name', { autoComplete: 'name' })} />}
        </Field>
        <Field id="email" label="Email" error={show('email')}>
          {(a) => <input {...a} {...bind('email', { type: 'email', autoComplete: 'email', inputMode: 'email' })} />}
        </Field>
        <Field id="phone" label="Phone (optional)" hint="Only shared with a place when you join its line." error={show('phone')}>
          {(a) => <input {...a} {...bind('phone', { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })} />}
        </Field>
        <Field id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={show('password')}>
          {(a) => <input {...a} {...bind('password', { type: 'password', autoComplete: 'new-password' })} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" busy={busy}>Create account</Button>
      </form>
      <div className="mt-6 space-y-1.5 text-sm text-ink-muted">
        <p>Already have an account? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">Log in</Link></p>
        <p>Signing up a business? <Link to="/business/new" className="link">Use this form instead</Link></p>
      </div>
    </AuthLayout>
  );
}
