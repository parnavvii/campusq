import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../lib/format';

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="relative mx-auto mb-8 h-24 w-32" aria-hidden="true">
        <span className="absolute left-4 top-4 h-20 w-20 rounded-full bg-sage-soft" />
        <span className="absolute right-4 top-0 h-10 w-10 rounded-full bg-butter-soft" />
      </div>
      <h1 className="text-4xl">We couldn't find that page</h1>
      <p className="mt-3 text-ink-muted">The link may be old, or the place may have moved.</p>
      <Link to={user ? homeForRole(user.role) : '/explore'} className="mt-8 inline-flex min-h-11 items-center rounded-full bg-sage-deep px-6 font-semibold text-cream hover:bg-sage">
        {user ? 'Back to your page' : 'Find a place'}
      </Link>
    </div>
  );
}
