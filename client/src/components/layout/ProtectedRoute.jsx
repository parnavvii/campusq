/**
 * Client-side route guard. This only improves UX — every API endpoint enforces
 * the same role rules on the server, so hiding a page is never the security.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from '../../lib/format';
import Spinner from '../ui/Spinner';

export default function ProtectedRoute({ roles }) {
  const { user, restoring } = useAuth();
  const location = useLocation();

  if (restoring) return <div className="mx-auto max-w-6xl px-4"><Spinner label="One moment…" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return <Outlet />;
}
