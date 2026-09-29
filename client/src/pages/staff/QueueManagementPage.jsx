/**
 * Staff console for one service: now serving, Call Next / Complete / Skip,
 * walk-ins, today's bookings with check-in, pause/resume, the waiting list and
 * today's key numbers — all live over Socket.IO.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import SourceBadge from '../../components/ui/SourceBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import CounterBoard from '../../components/queue/CounterBoard';
import WalkInDialog from '../../components/queue/WalkInDialog';
import { AppointmentAPI, QueueAPI, ServiceAPI, errorMessage } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';
import { useNow } from '../../hooks/useNow';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { minutesLabel, relativeMinutes, timeLabel } from '../../lib/format';

function Figure({ label, value, unit }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="token-numerals text-4xl">
        {value ?? '—'}
        {unit && value !== null && value !== undefined && <span className="ml-1 font-sans text-sm font-semibold">{unit}</span>}
      </dd>
    </div>
  );
}

function TodaysBookings({ data, now, busyId, onCheckIn }) {
  const list = (data?.appointments || []).filter((a) => a.status !== 'CANCELLED');
  const upcoming = list.filter((a) => a.status === 'BOOKED').length;
  return (
    <section aria-labelledby="bookings-heading" className="card">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h2 id="bookings-heading" className="font-serif text-xl">Today's bookings</h2>
        <span className="text-sm text-ink-muted">{upcoming} still to arrive</span>
      </div>
      {list.length ? (
        <ul className="max-h-96 divide-y divide-line overflow-y-auto">
          {list.map((a) => {
            const canCheckIn = a.status === 'BOOKED' && now >= +new Date(a.checkInOpensAt) && now <= +new Date(a.checkInClosesAt);
            return (
              <li key={a.id} className="flex items-center gap-4 px-5 py-2.5">
                <span className="w-20 font-semibold tabular-nums">{timeLabel(a.slotStart)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.customer.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    <span className="font-mono">{a.code}</span>
                    {a.customer.phone && <> · {a.customer.phone}</>}
                  </p>
                </div>
                {a.status === 'CHECKED_IN' ? (
                  <span className="text-sm">Token <span className="token-numerals text-xl">{a.token}</span></span>
                ) : canCheckIn ? (
                  <Button size="sm" variant="go" busy={busyId === a.id} disabled={Boolean(busyId)} onClick={() => onCheckIn(a)}>Check in</Button>
                ) : (
                  <StatusBadge status={a.status} />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-6 text-center text-sm text-ink-muted">No bookings for today.</p>
      )}
    </section>
  );
}

export default function QueueManagementPage() {
  const serviceId = Number(useParams().id);
  const toast = useToast();
  const { user } = useAuth();
  const now = useNow(30000);
  const live = { events: ['queue:updated'], rooms: [serviceId], filter: (p) => p.serviceId === serviceId, deps: [serviceId] };
  const queue = useLiveData(() => QueueAPI.get(serviceId), live);
  const stats = useLiveData(() => ServiceAPI.statistics(serviceId).catch(() => null), live);
  const bookings = useLiveData(() => ServiceAPI.appointments(serviceId).catch(() => null), live);
  const [busy, setBusy] = useState(null);
  const [skipTarget, setSkipTarget] = useState(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const refresh = () => Promise.all([queue.reload(), stats.reload(), bookings.reload()]);

  const run = async (key, fn, successTitle) => {
    setBusy(key);
    try {
      const res = await fn();
      toast.success(successTitle || res.message);
      await refresh();
    } catch (err) {
      toast.error('Action not completed', errorMessage(err));
      refresh();
    } finally {
      setBusy(null);
    }
  };

  if (queue.loading) return <Spinner />;
  if (queue.error) return <Alert tone="error">{queue.error}</Alert>;

  const { service, serving, waiting, recent = [] } = queue.data;
  if (queue.data.view !== 'full') {
    return <Alert tone="error" title="You are not authorized to manage this queue.">Only staff assigned to {service.name} can operate it.</Alert>;
  }

  const paused = service.status === 'PAUSED';
  const closed = service.status === 'CLOSED';
  const today = stats.data?.today;

  return (
    <>
      <PageHeader
        back={<Link to="/staff" className="mb-3 inline-block text-sm font-semibold text-ink-muted hover:text-ink">← All queues</Link>}
        title={service.name}
        description={service.location}
        actions={
          <>
            <StatusBadge status={service.status} size="lg" />
            <Button size="sm" variant="accent" disabled={paused || closed} onClick={() => setWalkInOpen(true)}>Add a walk-in</Button>
            <Link to={`/staff/services/${serviceId}/stats`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-cream px-4 text-sm font-semibold hover:bg-white">
              Statistics
            </Link>
          </>
        }
      />

      {paused && (
        <Alert tone="warn" title="Queue paused" className="mb-5">
          Customers already in line keep their place. New customers can't join and calling next is disabled until you resume.
        </Alert>
      )}
      {closed && <Alert tone="info" title="Service closed" className="mb-5">An administrator has closed this service.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <CounterBoard
            token={serving?.token}
            caption={
              serving
                ? `${serving.customer.name}${serving.source === 'BOOKING' ? ` · booked ${timeLabel(serving.bookedFor)}` : ''} · called at ${timeLabel(serving.calledAt)}`
                : waiting.length
                  ? 'No one at the desk right now. Call the next person when you’re ready.'
                  : 'The queue is empty — a good moment for a breather.'
            }
          >
            <Button
              variant="butter"
              size="lg"
              className="w-full text-xl"
              busy={busy === 'next'}
              disabled={paused || closed || (!serving && !waiting.length) || (busy && busy !== 'next')}
              onClick={() => run('next', () => QueueAPI.callNext(serviceId))}
            >
              {waiting.length ? `Call next${waiting[0] ? ` — ${waiting[0].token}` : ''}` : serving ? 'Complete & finish' : 'No one waiting'}
            </Button>
            {serving && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button variant="onDark" busy={busy === 'complete'} disabled={Boolean(busy)} onClick={() => run('complete', () => QueueAPI.complete(serving.id))}>
                  Complete {serving.token}
                </Button>
                <Button variant="onDark" disabled={Boolean(busy)} onClick={() => setSkipTarget({ ...serving, reason: 'did not come when called' })}>
                  Skip (no-show)
                </Button>
              </div>
            )}
          </CounterBoard>

          <section aria-label="Queue controls" className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">{paused ? 'The queue is paused' : 'The queue is open'}</p>
              <p className="text-sm text-ink-muted">{paused ? 'Resume to accept new customers.' : 'Pause during a break; customers in line keep their place.'}</p>
            </div>
            {paused ? (
              <Button variant="go" busy={busy === 'resume'} disabled={Boolean(busy)} onClick={() => run('resume', () => ServiceAPI.resume(serviceId))}>Resume queue</Button>
            ) : (
              <Button variant="danger" busy={busy === 'pause'} disabled={Boolean(busy) || closed} onClick={() => run('pause', () => ServiceAPI.pause(serviceId))}>Pause queue</Button>
            )}
          </section>

          <section aria-label="Today's numbers" className="card p-6">
            <h2 className="mb-3 text-sm font-semibold text-ink-muted">Today</h2>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Figure label="Waiting" value={waiting.length} />
              <Figure label="Served" value={today?.served} />
              <Figure label="Cancelled" value={today ? today.cancelled + today.skipped : undefined} />
              <Figure label="Avg. wait" value={today?.avgWaitMinutes} unit="min" />
            </dl>
            <p className="mt-4 text-sm text-ink-muted">
              Average service time {service.avgServiceMinutes} min ({service.estimateSource === 'history' ? 'learned from recent customers' : 'default setting'}). Someone joining now would wait about {minutesLabel(service.estimatedWaitMinutes)}.
            </p>
          </section>

          {bookings.data && (
            <TodaysBookings
              data={bookings.data}
              now={now}
              busyId={busy?.startsWith?.('checkin-') ? Number(busy.slice(8)) : null}
              onCheckIn={(a) => run(`checkin-${a.id}`, () => AppointmentAPI.checkIn(a.id), `${a.customer.name} checked in`)}
            />
          )}
        </div>

        <div className="space-y-6">
          <section aria-labelledby="waiting-heading" className="card">
            <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
              <h2 id="waiting-heading" className="font-serif text-xl">Waiting list</h2>
              <span className="text-sm text-ink-muted">{waiting.length} waiting</span>
            </div>
            {waiting.length ? (
              <ol className="divide-y divide-line">
                {waiting.map((w, i) => (
                  <li key={w.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="token-numerals w-20 text-3xl text-sage-deep">{w.token}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="truncate">{w.customer.name}</span>
                        {i === 0 && <span className="rounded-full bg-butter px-2 py-0.5 text-xs font-semibold">Next</span>}
                        <SourceBadge source={w.source} bookedFor={w.bookedFor} />
                      </p>
                      <p className="truncate text-sm text-ink-muted">
                        {w.source === 'BOOKING' ? `Checked in ${relativeMinutes(w.joinedAt)}` : `Joined ${relativeMinutes(w.joinedAt)}`}
                        {w.customer.phone && ` · ${w.customer.phone}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setSkipTarget({ ...w, reason: 'is not here' })}>
                      Skip
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-8 text-center text-ink-muted">No one is waiting. New customers appear here instantly.</p>
            )}
            <p className="border-t border-line px-5 py-2.5 text-xs text-ink-muted">
              Booked customers are called at their slot time; everyone else in the order they arrived.
            </p>
          </section>

          {recent.length > 0 && (
            <section aria-labelledby="recent-heading" className="card">
              <h2 id="recent-heading" className="border-b border-line px-6 py-4 font-serif text-xl">Recently finished</h2>
              <ul className="divide-y divide-line">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                    <span className="token-numerals w-16 text-xl">{r.token}</span>
                    <span className="min-w-0 flex-1 truncate">{r.customerName}</span>
                    <span className="text-ink-muted">{timeLabel(r.finishedAt)}</span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <WalkInDialog open={walkInOpen} service={service} businessSlug={user.business?.slug} onClose={() => setWalkInOpen(false)} onIssued={() => refresh()} />

      <ConfirmDialog
        open={Boolean(skipTarget)}
        title={skipTarget ? `Skip ${skipTarget.token}?` : ''}
        confirmLabel="Skip token"
        cancelLabel="Don't skip"
        busy={busy === 'skip'}
        onCancel={() => setSkipTarget(null)}
        onConfirm={async () => {
          const target = skipTarget;
          await run('skip', () => QueueAPI.skip(target.id));
          setSkipTarget(null);
        }}
      >
        {skipTarget && <>Use this when {skipTarget.customer.name} {skipTarget.reason}. {skipTarget.customer.isGuest ? 'They can be added again as a walk-in.' : "They'll be notified and can join again."}</>}
      </ConfirmDialog>
    </>
  );
}
