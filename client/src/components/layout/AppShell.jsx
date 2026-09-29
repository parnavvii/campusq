import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import BrandMark from './BrandMark';

const NAV = {
  GUEST: [
    ['/explore', 'Find a place'],
    ['/business/new', 'For businesses'],
  ],
  CUSTOMER: [
    ['/me', 'My visits', true],
    ['/explore', 'Find a place'],
    ['/me/history', 'History'],
  ],
  STAFF: [
    ['/staff', 'Queues', true],
    ['/staff/reports', 'Daily report'],
  ],
  ADMIN: [
    ['/staff', 'Queues', true],
    ['/staff/reports', 'Report'],
    ['/admin/services', 'Services'],
    ['/admin/staff', 'Team'],
    ['/admin/business', 'Settings'],
  ],
};

function LiveDot() {
  const { connected } = useSocket();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted" title={connected ? 'Updates arrive live' : 'Reconnecting…'}>
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-sage' : 'bg-rose'}`} aria-hidden="true" />
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = user?.role || 'GUEST';
  const links = NAV[role];
  const team = role === 'STAFF' || role === 'ADMIN';

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const linkClass = ({ isActive }) =>
    `block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      isActive ? 'bg-cream text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
    }`;

  const account = user ? (
    <>
      <LiveDot />
      {team && user.business && (
        <a href={`/p/${user.business.slug}/board`} target="_blank" rel="noreferrer" className="whitespace-nowrap text-sm font-semibold text-ink-muted hover:text-ink">
          Waiting-room screen ↗
        </a>
      )}
      <span className="whitespace-nowrap text-sm text-ink-soft">{user.name.split(' ')[0]}</span>
      <button type="button" onClick={handleLogout} className="whitespace-nowrap rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-ink-soft hover:bg-cream">
        Log out
      </button>
    </>
  ) : (
    <>
      <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="whitespace-nowrap text-sm font-semibold text-ink-soft hover:text-ink">Log in</Link>
      <Link to="/register" className="whitespace-nowrap rounded-full bg-sage-deep px-4 py-2 text-sm font-semibold text-cream hover:bg-sage">Sign up</Link>
    </>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-cream focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-4">
          <Link to={user ? links[0][0] : '/'} className="min-w-0 shrink-0" aria-label="Waitwell home">
            <BrandMark sub={team ? user.business?.name : undefined} />
          </Link>
          <nav aria-label="Main" className="hidden flex-1 lg:block">
            <ul className="flex gap-1">
              {links.map(([to, label, end]) => (
                <li key={to}><NavLink to={to} end={end} className={linkClass}>{label}</NavLink></li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto hidden items-center gap-4 lg:flex">{account}</div>
          <div className="ml-auto flex items-center gap-3 lg:hidden">
            {user && <LiveDot />}
            <button
              type="button"
              className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
        </div>
        {menuOpen && (
          <div id="mobile-menu" className="border-t border-line/70 px-4 pb-4 lg:hidden">
            <ul className="space-y-1 pt-3">
              {links.map(([to, label, end]) => (
                <li key={to}><NavLink to={to} end={end} className={linkClass}>{label}</NavLink></li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line/70 pt-3">{account}</div>
          </div>
        )}
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
