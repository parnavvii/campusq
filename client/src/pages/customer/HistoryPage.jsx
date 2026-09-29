import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import SourceBadge from '../../components/ui/SourceBadge';
import { QueueAPI } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';
import { useMyBookings } from '../../hooks/useCustomerQueue';
import { dateTimeLabel } from '../../lib/format';

export default function HistoryPage() {
  const { data, loading, error } = useLiveData(QueueAPI.myHistory, {
    events: ['token:called', 'token:skipped', 'token:completed'],
  });
  const bookings = useMyBookings();
  const past = bookings.data?.past || [];

  return (
    <>
      <PageHeader title="History" description="Your last 50 visits and 20 past bookings, everywhere you've used Waitwell." />
      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : !data.length ? (
        <EmptyState title="No visits yet" action={<Link to="/explore" className="link">Find a place</Link>}>
          Once you join a queue or check in for a booking, it will be listed here.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {data.map((e) => {
            const tz = e.business?.timezone;
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4">
                <span className="token-numerals w-20 text-3xl text-sage-deep">{e.token}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.serviceName}</p>
                  <p className="text-sm text-ink-muted">
                    {e.business && <Link to={`/p/${e.business.slug}`} className="hover:text-ink">{e.business.name}</Link>} · {dateTimeLabel(e.joinedAt, tz)}
                  </p>
                </div>
                <SourceBadge source={e.source} bookedFor={e.bookedFor} tz={tz} />
                <StatusBadge status={e.status} />
              </li>
            );
          })}
        </ul>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-bookings" className="mt-12">
          <h2 id="past-bookings" className="mb-4 text-2xl">Past bookings</h2>
          <ul className="card divide-y divide-line">
            {past.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.serviceName}</p>
                  <p className="text-sm text-ink-muted">
                    {b.business?.name} · {dateTimeLabel(b.slotStart, b.business?.timezone)} · code {b.code}
                  </p>
                </div>
                {b.token && <span className="token-numerals text-xl">{b.token}</span>}
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
