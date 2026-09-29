/** A customer's token: the number, where to go, and how their place in line is moving. */
import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import Button from '../ui/Button';
import QueueDots from './QueueDots';
import { minutesLabel, timeLabel } from '../../lib/format';

export default function TokenCard({ entry, onCancel, compact = false }) {
  const tz = entry.business?.timezone;
  const serving = entry.status === 'SERVING';
  const paused = entry.serviceStatus === 'PAUSED';
  const booked = entry.source === 'BOOKING';
  const slotPending = booked && new Date(entry.bookedFor) > new Date();
  const next = !serving && !slotPending && entry.peopleAhead <= 1 && !entry.bookingsAhead;

  return (
    <article aria-label={`Token ${entry.token} for ${entry.serviceName}`} className="card overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className={`flex flex-col justify-between gap-2 p-6 sm:w-56 ${serving ? 'bg-apricot-soft' : 'bg-sage-tint'}`}>
          <p className="text-sm font-medium text-ink-muted">Your token</p>
          <p className={`token-numerals ${compact ? 'text-6xl' : 'text-7xl'} ${serving ? 'text-apricot-deep' : 'text-sage-deep'}`}>{entry.token}</p>
          <p className="text-sm text-ink-muted">
            {booked ? `Booked for ${timeLabel(entry.bookedFor, tz)}` : `Joined ${timeLabel(entry.joinedAt, tz)}`}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {entry.business && (
                <Link to={`/p/${entry.business.slug}`} className="text-sm font-semibold text-sage-deep hover:underline">
                  {entry.business.name}
                </Link>
              )}
              <h3 className="font-serif text-xl">{entry.serviceName}</h3>
              <p className="text-sm text-ink-muted">{entry.serviceLocation}</p>
            </div>
            <StatusBadge status={entry.status} size="lg" />
          </div>

          {serving ? (
            <div className="rounded-2xl bg-apricot-soft px-4 py-3" role="status">
              <p className="font-serif text-2xl text-apricot-deep">It's your turn.</p>
              <p className="text-ink-soft">Please head to {entry.serviceLocation} now.</p>
            </div>
          ) : (
            <>
              <QueueDots ahead={entry.peopleAhead} />
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-sm text-ink-muted">Ahead of you</dt>
                  <dd className="token-numerals text-4xl">{entry.peopleAhead}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">About</dt>
                  <dd className="token-numerals text-4xl">
                    {entry.estimatedWaitMinutes <= 0 ? 'now' : entry.estimatedWaitMinutes}
                    {entry.estimatedWaitMinutes > 0 && <span className="ml-1 font-sans text-sm font-semibold text-ink-muted">min</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">Now serving</dt>
                  <dd key={entry.currentToken || 'none'} className="flip-in token-numerals text-4xl text-apricot-deep">{entry.currentToken || '—'}</dd>
                </div>
              </dl>
            </>
          )}

          {slotPending && !serving && (
            <p className="rounded-2xl bg-butter-soft px-4 py-2.5 text-sm">
              You're checked in. Booked customers are called at their time — expect to be called around {timeLabel(entry.bookedFor, tz)}.
            </p>
          )}
          {next && !paused && (
            <p className="rounded-2xl bg-butter-soft px-4 py-2.5 text-sm font-semibold">You're next — please be close to {entry.serviceLocation}.</p>
          )}
          {!serving && !booked && entry.bookingsAhead > 0 && (
            <p className="text-sm text-ink-muted">
              Includes {entry.bookingsAhead} booked {entry.bookingsAhead === 1 ? 'customer' : 'customers'} whose time comes up before yours.
            </p>
          )}
          {paused && !serving && (
            <p className="rounded-2xl bg-butter-soft px-4 py-2.5 text-sm">The team has paused this queue for a moment. You keep your place.</p>
          )}

          {!compact && (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-sm text-ink-muted">
                {serving ? 'Being served — talk to the team if you need to leave.' : `Number ${entry.position} in line · about ${minutesLabel(entry.estimatedWaitMinutes)} at ~${entry.avgServiceMinutes} min each`}
              </p>
              {!serving && onCancel && <Button variant="danger" size="sm" onClick={() => onCancel(entry)}>Leave queue</Button>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
