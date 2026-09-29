/** A customer's home: where they're in line right now, bookings coming up, and places to try. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TokenCard from '../../components/queue/TokenCard';
import BookingCard from '../../components/queue/BookingCard';
import CancelDialog from '../../components/queue/CancelDialog';
import BusinessCard from '../../components/business/BusinessCard';
import { useAuth } from '../../context/AuthContext';
import { BusinessAPI } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';
import { useBookingActions, useMyBookings, useMyEntries, useQueueActions } from '../../hooks/useCustomerQueue';
import { notificationsSupported, requestNotificationPermission } from '../../lib/notify';
import { greeting, relativeDay, timeLabel } from '../../lib/format';

function AlertsToggle() {
  const [permission, setPermission] = useState(notificationsSupported() ? Notification.permission : 'unsupported');
  if (permission === 'unsupported' || permission === 'granted') return null;
  if (permission === 'denied') return <p className="text-sm text-ink-muted">Phone alerts are off — you'll still see updates here.</p>;
  return (
    <Button variant="outline" size="sm" onClick={async () => setPermission(await requestNotificationPermission())}>
      Remind me when it's my turn
    </Button>
  );
}

export default function MyVisitsPage() {
  const { user } = useAuth();
  const mine = useMyEntries();
  const bookings = useMyBookings();
  const places = useLiveData(() => BusinessAPI.list(), { pollMs: 60000 });
  const actions = useQueueActions({ onChanged: mine.reload });
  const bookingActions = useBookingActions({ onChanged: () => { bookings.reload(); mine.reload(); } });
  const upcoming = bookings.data?.upcoming || [];
  const cancelTz = bookingActions.cancelTarget?.business?.timezone;

  return (
    <>
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl">{greeting()}, {user.name.split(' ')[0]}.</h1>
          <p className="mt-2 text-ink-muted">Your place in line and your bookings, all in one spot. This page keeps itself up to date.</p>
        </div>
        <AlertsToggle />
      </header>

      {mine.loading || bookings.loading ? (
        <Spinner />
      ) : mine.error || bookings.error ? (
        <Alert tone="error">{mine.error || bookings.error}</Alert>
      ) : mine.data.length || upcoming.length ? (
        <div className="space-y-10">
          {mine.data.length > 0 && (
            <section aria-labelledby="line-heading" className="space-y-5">
              <h2 id="line-heading" className="text-2xl">In line now</h2>
              {mine.data.map((e) => (
                <TokenCard key={e.id} entry={e} onCancel={actions.setCancelTarget} />
              ))}
            </section>
          )}
          {upcoming.length > 0 && (
            <section aria-labelledby="coming-heading" className="space-y-5">
              <h2 id="coming-heading" className="text-2xl">Coming up</h2>
              {upcoming.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  busy={bookingActions.busyId === b.id}
                  onCheckIn={bookingActions.checkIn}
                  onCancel={bookingActions.setCancelTarget}
                />
              ))}
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          title="Nothing on your list today"
          action={<Link to="/explore" className="inline-flex min-h-11 items-center rounded-full bg-sage-deep px-6 font-semibold text-cream hover:bg-sage">Find a place</Link>}
        >
          When you join a queue or book a time, it shows up here.
        </EmptyState>
      )}

      {places.data?.length > 0 && (
        <section aria-labelledby="places-heading" className="mt-14">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 id="places-heading" className="text-2xl">Places you can visit</h2>
            <Link to="/explore" className="link text-sm">See all</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {places.data.slice(0, 3).map((b) => (
              <BusinessCard key={b.id} business={b} />
            ))}
          </div>
        </section>
      )}

      <CancelDialog target={actions.cancelTarget} busy={actions.cancelling} onConfirm={actions.confirmCancel} onClose={() => actions.setCancelTarget(null)} />
      <ConfirmDialog
        open={Boolean(bookingActions.cancelTarget)}
        title="Cancel this booking?"
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
        busy={Boolean(bookingActions.cancelTarget) && bookingActions.busyId === bookingActions.cancelTarget?.id}
        onConfirm={bookingActions.confirmCancel}
        onCancel={() => bookingActions.setCancelTarget(null)}
      >
        {bookingActions.cancelTarget && (
          <>
            {bookingActions.cancelTarget.serviceName} at {bookingActions.cancelTarget.business?.name}, {relativeDay(bookingActions.cancelTarget.slotStart, cancelTz)} at{' '}
            {timeLabel(bookingActions.cancelTarget.slotStart, cancelTz)}. The time will be freed for someone else.
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
