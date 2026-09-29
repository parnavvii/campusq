import { Link, useLocation } from 'react-router-dom';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { relativeDay, timeLabel } from '../../lib/format';

const pill = 'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[0.95rem] font-semibold transition-colors';

/** What someone can do with one service: join the queue now, or book a time. */
export default function ServiceActions({ service, businessSlug, entry, booking, joiningId, onJoin }) {
  const { user } = useAuth();
  const location = useLocation();
  const canBook = service.booking?.enabled && service.status !== 'CLOSED';
  const bookUrl = `/p/${businessSlug}/book/${service.id}`;

  if (!user) {
    const next = encodeURIComponent(location.pathname);
    return (
      <div className="flex flex-wrap gap-2">
        {service.status === 'ACTIVE' && <Link to={`/login?next=${next}`} className={`${pill} bg-sage-deep text-cream hover:bg-sage`}>Log in to join</Link>}
        {canBook && <Link to={`/login?next=${encodeURIComponent(bookUrl)}`} className={`${pill} border border-line bg-cream hover:bg-white`}>Book a time</Link>}
      </div>
    );
  }
  if (user.role !== 'CUSTOMER') {
    return <p className="text-sm text-ink-muted">Customers see “Join” and “Book” here.</p>;
  }

  let queueAction;
  if (entry) {
    queueAction = (
      <Link to="/me" className={`${pill} bg-sage-soft text-sage-deep`}>
        Your token <span className="ml-1.5 token-numerals text-xl">{entry.token}</span>
      </Link>
    );
  } else if (service.status === 'PAUSED') {
    queueAction = <p className="self-center text-sm font-medium text-butter-deep">Queue paused for a moment</p>;
  } else if (service.status === 'CLOSED') {
    queueAction = <p className="self-center text-sm font-medium text-ink-muted">Closed today</p>;
  } else {
    queueAction = (
      <Button busy={joiningId === service.id} disabled={joiningId !== null && joiningId !== service.id} onClick={() => onJoin(service)}>
        Join the queue
      </Button>
    );
  }

  let bookAction = null;
  if (booking) {
    const tz = booking.business?.timezone;
    bookAction = (
      <Link to="/me" className={`${pill} bg-butter-soft text-sm text-butter-deep`}>
        Booked · {relativeDay(booking.slotStart, tz)} {timeLabel(booking.slotStart, tz)}
      </Link>
    );
  } else if (canBook) {
    bookAction = <Link to={bookUrl} className={`${pill} border border-line bg-cream hover:bg-white`}>Book a time</Link>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {queueAction}
      {bookAction}
    </div>
  );
}
