/** A place in the directory: what it is, where, and how busy it is right now. */
import { Link } from 'react-router-dom';
import { CATEGORIES } from '../../lib/brand';
import { minutesLabel } from '../../lib/format';

export default function BusinessCard({ business: b }) {
  const cat = CATEGORIES[b.category] || CATEGORIES.OTHER;
  return (
    <Link to={`/p/${b.slug}`} className="card group flex flex-col gap-4 p-6 transition-shadow hover:shadow-lift">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <span className={`h-2.5 w-2.5 rounded-full ${cat.dot}`} aria-hidden="true" />
        {cat.short}
      </p>
      <div>
        <h3 className="font-serif text-2xl leading-tight group-hover:text-sage-deep">{b.name}</h3>
        {b.tagline && <p className="mt-1 text-ink-soft">{b.tagline}</p>}
        {b.address && <p className="mt-1 text-sm text-ink-muted">{b.address}</p>}
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        {b.openServices > 0 ? (
          <span className="chip bg-sage-soft text-sage-deep">
            {b.shortestWaitMinutes > 0
              ? `Shortest wait ${minutesLabel(b.shortestWaitMinutes)}`
              : b.waitingNow > 0
                ? 'No wait for some services'
                : 'No wait right now'}
          </span>
        ) : (
          <span className="chip bg-ink/5 text-ink-muted">Closed right now</span>
        )}
        {b.waitingNow > 0 && <span className="chip bg-paper text-ink-soft">{b.waitingNow} waiting</span>}
        {b.takesBookings && <span className="chip bg-butter-soft text-butter-deep">Takes bookings</span>}
      </div>
    </Link>
  );
}
