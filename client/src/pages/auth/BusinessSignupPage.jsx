/** Any kind of service business signs up: its details plus the owner's account, in one step. */
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/api';
import { CATEGORIES } from '../../lib/brand';
import { homeForRole } from '../../lib/format';

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
};

function validate(f) {
  return {
    businessName: f.businessName.trim().length < 2 ? 'What do customers call your business?' : '',
    name: f.name.trim().length < 2 ? 'Please tell us your name.' : '',
    email: !/^\S+@\S+\.\S+$/.test(f.email.trim()) ? 'That email doesn’t look right.' : '',
    password:
      f.password.length < 8
        ? 'Use at least 8 characters.'
        : !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)
          ? 'Include at least one letter and one number.'
          : '',
  };
}

const aside = (
  <>
    <p className="max-w-md font-serif text-4xl leading-tight">A calmer waiting room, without the waiting room.</p>
    <ul className="mt-6 max-w-sm space-y-2.5 text-ink-soft">
      {['Walk-ins and bookings in one line', 'Customers wait wherever they like', 'A daily report of who came and how long they waited'].map((t) => (
        <li key={t} className="flex gap-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sage" aria-hidden="true" />
          {t}
        </li>
      ))}
    </ul>
  </>
);

export default function BusinessSignupPage() {
  const { user, signupBusiness } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: '', category: 'SALON', tagline: '', address: '', timezone: browserZone(), name: '', email: '', phone: '', password: '' });
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  // Some browsers report a zone under an older name than they list (Asia/Kolkata vs Asia/Calcutta), so keep the chosen one in the list.
  const zones = useMemo(() => [...new Set([form.timezone, ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [])])], [form.timezone]);

  if (user) return <Navigate to={homeForRole(user.role)} replace />;

  const errors = validate(form);
  const show = (k) => touched[k] && errors[k];
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setServerError('');
  };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ businessName: true, name: true, email: true, password: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await signupBusiness({
        businessName: form.businessName.trim(),
        category: form.category,
        tagline: form.tagline.trim(),
        address: form.address.trim(),
        timezone: form.timezone,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      toast.success(`${form.businessName.trim()} is on Waitwell`, 'Add your first service to open your queue.');
      navigate('/admin/services?welcome=1', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout wide title="List your business" subtitle="Salons, clinics, repair shops, offices, help desks — if people wait for you, Waitwell can help. Free to start." aside={aside}>
      <form onSubmit={submit} noValidate className="space-y-8" method="post">
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <fieldset className="space-y-5">
          <legend className="mb-1 font-serif text-2xl">Your business</legend>
          <Field id="biz-name" label="Business name" error={show('businessName')}>
            {(a) => <input {...a} className="input" autoComplete="organization" value={form.businessName} onChange={set('businessName')} onBlur={blur('businessName')} />}
          </Field>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-soft">What kind of place is it?</p>
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
          <Field id="biz-tagline" label="Short description (optional)" hint="e.g. “Hair, beauty & grooming” or “Phone and laptop repairs”.">
            {(a) => <input {...a} className="input" maxLength={200} value={form.tagline} onChange={set('tagline')} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="biz-address" label="Address (optional)">
              {(a) => <input {...a} className="input" autoComplete="street-address" maxLength={200} value={form.address} onChange={set('address')} />}
            </Field>
            <Field id="biz-tz" label="Timezone">
              {(a) => (
                <select {...a} className="input" value={form.timezone} onChange={set('timezone')}>
                  {zones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="mb-1 font-serif text-2xl">Your account</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="owner-name" label="Your name" error={show('name')}>
              {(a) => <input {...a} className="input" autoComplete="name" value={form.name} onChange={set('name')} onBlur={blur('name')} />}
            </Field>
            <Field id="owner-phone" label="Phone (optional)">
              {(a) => <input {...a} className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />}
            </Field>
          </div>
          <Field id="owner-email" label="Email" error={show('email')}>
            {(a) => <input {...a} className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')} />}
          </Field>
          <Field id="owner-password" label="Password" hint="At least 8 characters, with a letter and a number." error={show('password')}>
            {(a) => <input {...a} className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} onBlur={blur('password')} />}
          </Field>
        </fieldset>

        <Button type="submit" size="lg" className="w-full" busy={busy}>Create my business</Button>
        <p className="text-sm text-ink-muted">Already set up? <Link to="/login" className="link">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
