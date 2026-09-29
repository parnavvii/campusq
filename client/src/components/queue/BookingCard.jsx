/** An upcoming booking: when, where, the booking code, and check-in / cancel. */
import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import Button from '../ui/Button';
import { useNow } from '../../hooks/useNow';
import { clockParts, relativeDay, timeLabel } from '../../lib/format';

export default function BookingCard({ booking, onCheckIn, onCancel, busy }) {
  const tz = booking.business?.timezone;
  const now = useNow(15000);
  const opens = +new Date(booking.checkInOpensAt);
  const closes = +new Date(booking.checkInClosesAt);
  const active = booking.status === 'BOOKED';
  const canCheckIn = active && now >= opens && now <= closes;
  const minutesToOpen = Math.ceil((opens - now) / 60000);
  const clock = clockParts(booking.slotStart, tz);

  return (
    <article aria-label={`Booking at ${booking.business?.name || booking.serviceName}`} className="card flex flex-col overflow-hidden sm:flex-row">
      <div className="flex flex-col justify-center bg-butter-soft p-6 sm:w-56">
        <p className="text-sm font-medium capitalize text-butter-deep">{relativeDay(booking.slotStart, tz)}</p>
        <p className="token-numerals text-6xl text-ink">
          {clock.hm}
          <span className="ml-1 font-sans text-base font-semibold text-ink-muted">{clock.period}</span>
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          {booking.business && (
            <Link to={`/p/${booking.business.slug}`} className="text-sm font-semibold text-sage-deep hover:underline">{booking.business.name}</Link>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-xl">{booking.serviceName}</h3>
            <StatusBadge status={booking.status} />
          </div>
          <p className="text-sm text-ink-muted">{booking.serviceLocation}</p>
          <p className="text-sm">
            Booking code <span className="font-semibold tracking-wider">{booking.code}</span>
            {booking.token && <> · token <span className="token-numerals text-lg">{booking.token}</span></>}
          </p>
          {active && (
            <p className={`text-sm ${canCheckIn ? 'font-semibold text-sage-deep' : 'text-ink-muted'}`}>
              {canCheckIn
                ? "You can check in now — tap \"I'm here\" when you arrive."
                : now < opens
                  ? `Check-in opens at ${timeLabel(booking.checkInOpensAt, tz)}${minutesToOpen <= 90 ? ` (in ${minutesToOpen} min)` : ''}.`
                  : 'The check-in window has closed.'}
            </p>
          )}
        </div>
        {active && (onCheckIn || onCancel) && (
          <div className="flex shrink-0 flex-wrap gap-2 md:flex-col">
            {onCheckIn && (
              <Button variant="go" disabled={!canCheckIn || busy} busy={busy} onClick={() => onCheckIn(booking)}>I'm here</Button>
            )}
            {onCancel && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(booking)}>Cancel booking</Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
