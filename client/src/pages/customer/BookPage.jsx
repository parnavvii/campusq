/**
 * Book a time for one service. The side panel compares walking in now with the
 * next free time, and shows the hours that are usually quietest — so customers
 * can pick the quickest way to be seen.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { AppointmentAPI, BusinessAPI, ServiceAPI, errorMessage } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';
import { useNow } from '../../hooks/useNow';
import { useMyBookings, useMyEntries, useQueueActions } from '../../hooks/useCustomerQueue';
import { useToast } from '../../context/ToastContext';
import { clockParts, dateStringLabel, hhmmLabel, minutesLabel, relativeDay, setDisplayTimeZone, timeLabel } from '../../lib/format';

function datesBetween(first, last) {
  const out = [];
  for (let d = first; d <= last; ) {
    out.push(d);
    const n = new Date(`${d}T00:00:00Z`);
    n.setUTCDate(n.getUTCDate() + 1);
    d = n.toISOString().slice(0, 10);
  }
  return out;
}

function SlotButton({ slot, capacity, selected, disabled, onPick }) {
  const clock = clockParts(slot.start);
  const status = slot.mine ? 'Yours' : slot.past ? 'Gone' : slot.available === 0 ? 'Full' : capacity > 1 ? `${slot.available} left` : 'Free';
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onPick(slot)}
      className={`rounded-2xl px-2 py-3 text-center transition-all disabled:cursor-not-allowed ${
        selected ? 'bg-sage-deep text-cream shadow-soft' : disabled ? 'bg-paper text-ink-muted/50' : 'bg-cream shadow-soft hover:-translate-y-0.5 hover:shadow-lift'
      }`}
    >
      <span className="block font-semibold tabular-nums">
        {clock.hm} <span className="text-xs">{clock.period}</span>
      </span>
      <span className={`block text-xs ${selected ? 'text-cream/80' : 'text-ink-muted'}`}>{status}</span>
    </button>
  );
}

function QuietHours({ insights }) {
  if (!insights || insights.samples < 3) {
    return <p className="text-sm text-ink-muted">Not enough history yet to show quiet hours for this service.</p>;
  }
  const max = Math.max(...insights.hours.map((h) => h.avgWaitMinutes || 0), 1);
  return (
    <div>
      {insights.quietestHour && (
        <p className="text-sm text-ink-soft">
          Usually quietest around <strong>{insights.quietestHour.label}</strong> (about {Math.round(insights.quietestHour.avgWaitMinutes)} min wait)
          {insights.busiestHour && insights.busiestHour.hour !== insights.quietestHour.hour && <>, busiest around {insights.busiestHour.label}</>}.
        </p>
      )}
      <div className="mt-4 flex h-24 items-end gap-1.5" role="img" aria-label="Typical wait by hour of the day">
        {insights.hours.map((h) => (
          <div key={h.hour} className="flex h-full flex-1 flex-col justify-end" title={`${h.label}: ${h.avgWaitMinutes ?? '—'} min`}>
            <div
              className={`w-full rounded-full ${h.hour === insights.quietestHour?.hour ? 'bg-sage' : 'bg-sage/25'}`}
              style={{ height: `${h.samples ? Math.max(8, ((h.avgWaitMinutes || 0) / max) * 100) : 4}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted">
        <span>{insights.hours[0]?.label}</span>
        <span>{insights.hours[insights.hours.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export default function BookPage() {
  const { slug, serviceId: idParam } = useParams();
  const serviceId = Number(idParam);
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(30000);
  const live = { events: ['queue:updated'], rooms: [serviceId], filter: (p) => p.serviceId === serviceId, deps: [serviceId] };
  const page = useLiveData(() => BusinessAPI.page(slug), { ...live, deps: [slug, serviceId] });
  const insights = useLiveData(() => ServiceAPI.insights(serviceId), { deps: [serviceId] });
  const today = useLiveData(() => ServiceAPI.slots(serviceId), live);
  const [date, setDate] = useState(null);
  const slots = useLiveData(() => ServiceAPI.slots(serviceId, date || undefined), { ...live, deps: [serviceId, date] });
  const bookings = useMyBookings();
  const mine = useMyEntries();
  const queue = useQueueActions({ onChanged: () => { mine.reload(); page.reload(); } });
  const [picked, setPicked] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const business = page.data?.business;
  useEffect(() => {
    if (business) setDisplayTimeZone(business.timezone);
  }, [business]);
  useEffect(() => setPicked(null), [date]);

  const dates = useMemo(() => (today.data ? datesBetween(today.data.firstDate, today.data.lastDate) : []), [today.data]);

  if (page.loading || today.loading) return <Spinner />;
  if (page.error || today.error) return <Alert tone="error">{page.error || today.error}</Alert>;

  const s = page.data.services.find((x) => x.id === serviceId);
  if (!s) return <Alert tone="error">We couldn't find that service at {business.name}.</Alert>;

  const existing = (bookings.data?.upcoming || []).find((b) => b.serviceId === serviceId);
  const token = (mine.data || []).find((e) => e.serviceId === serviceId);
  const nextFree = today.data.slots.find((x) => !x.past && x.available > 0 && !x.mine);
  const selectedDate = date || today.data.firstDate;
  const canBook = s.booking.enabled && s.status !== 'CLOSED';
  const minsToNextFree = nextFree ? Math.max(0, Math.round((+new Date(nextFree.start) - now) / 60000)) : null;

  let advice;
  if (s.status !== 'ACTIVE') {
    advice = `The queue is ${s.status === 'PAUSED' ? 'paused' : 'closed'} right now${canBook ? ', so booking a time is the way in.' : '.'}`;
  } else if (!nextFree) {
    advice = `No free times left today. Joining the queue now means about ${minutesLabel(s.estimatedWaitMinutes)} — or pick another day.`;
  } else if (s.estimatedWaitMinutes <= minsToNextFree) {
    advice = `Joining the queue now is quicker — about ${minutesLabel(s.estimatedWaitMinutes)}, versus the next free time at ${timeLabel(nextFree.start)}.`;
  } else {
    advice = `The queue is about ${minutesLabel(s.estimatedWaitMinutes)} right now. Booking ${timeLabel(nextFree.start)} (in ${minutesLabel(minsToNextFree)}) should get you seen sooner.`;
  }

  const book = async () => {
    setBusy(true);
    try {
      const { appointment } = await AppointmentAPI.book(serviceId, picked.start);
      toast.success(`Booked for ${relativeDay(appointment.slotStart)} at ${timeLabel(appointment.slotStart)}`, `Your booking code is ${appointment.code}. Tap "I'm here" when you arrive.`);
      navigate('/me');
    } catch (err) {
      toast.error("Couldn't book that time", errorMessage(err));
      setConfirming(false);
      setPicked(null);
      slots.reload();
      bookings.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="mb-8">
        <Link to={`/p/${slug}`} className="text-sm font-semibold text-ink-muted hover:text-ink">← {business.name}</Link>
        <h1 className="mt-3 text-4xl">Book {s.name}</h1>
        <p className="mt-2 text-ink-muted">
          {s.location} · {s.booking.slotMinutes}-minute appointments, {hhmmLabel(s.booking.openTime)} – {hhmmLabel(s.booking.closeTime)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="pick-slot" className="card min-w-0 p-6 sm:p-7">
          <h2 id="pick-slot" className="text-2xl">Pick a time</h2>

          {!canBook ? (
            <Alert tone="info" className="mt-4">{s.booking.enabled ? 'This service is closed.' : "This service doesn't take bookings — join the queue instead."}</Alert>
          ) : existing ? (
            <Alert tone="info" title="You already have a booking here" className="mt-4">
              {relativeDay(existing.slotStart)} at {timeLabel(existing.slotStart)} (code {existing.code}). <Link to="/me" className="link">Manage it</Link> to change the time.
            </Alert>
          ) : null}

          <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Choose a day">
            {dates.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === selectedDate}
                onClick={() => setDate(d)}
                className={`shrink-0 rounded-2xl px-4 py-2.5 text-left transition-colors ${d === selectedDate ? 'bg-sage-deep text-cream' : 'bg-paper text-ink-soft hover:bg-sage-tint'}`}
              >
                <span className="block text-xs font-semibold">{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dateStringLabel(d, { weekday: 'short' })}</span>
                <span className="block font-semibold">{dateStringLabel(d, { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>

          {slots.loading ? (
            <Spinner label="Finding free times…" />
          ) : slots.error ? (
            <Alert tone="error" className="mt-3">{slots.error}</Alert>
          ) : !slots.data.slots.length ? (
            <p className="mt-4 text-ink-muted">No times on this day.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-5">
              {slots.data.slots.map((slot) => (
                <SlotButton
                  key={slot.start}
                  slot={slot}
                  capacity={slots.data.capacity}
                  selected={picked?.start === slot.start}
                  disabled={!canBook || Boolean(existing) || slot.past || slot.available === 0}
                  onPick={setPicked}
                />
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="max-w-md text-sm text-ink-muted">
              {picked
                ? `${dateStringLabel(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })} at ${timeLabel(picked.start)}`
                : `You can check in from ${business.checkinEarlyMinutes} minutes before. Bookings not checked in by ${business.noShowMinutes} minutes after the start are released.`}
            </p>
            <Button disabled={!picked} onClick={() => setConfirming(true)}>Book this time</Button>
          </div>
        </section>

        <aside className="min-w-0 space-y-6">
          <section aria-labelledby="assistant" className="rounded-3xl bg-sage-tint p-6 sm:p-7">
            <h2 id="assistant" className="text-2xl">Which is quicker?</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-ink-muted">Walk in now</dt>
                <dd className="token-numerals mt-1 text-4xl text-sage-deep">{s.status === 'ACTIVE' ? minutesLabel(s.estimatedWaitMinutes) : '—'}</dd>
                {s.status === 'ACTIVE' && (
                  <dd className="mt-1 text-xs text-ink-muted">{s.peopleAheadIfJoining} ahead{s.bookingsAheadIfJoining ? ` + ${s.bookingsAheadIfJoining} booked` : ''}</dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-ink-muted">Next free time</dt>
                <dd className="token-numerals mt-1 text-4xl text-apricot-deep">{nextFree ? clockParts(nextFree.start).hm : '—'}</dd>
                {nextFree && <dd className="mt-1 text-xs text-ink-muted">today · in {minutesLabel(minsToNextFree)}</dd>}
              </div>
            </dl>
            <p className="mt-5 text-ink-soft">{advice}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {token ? (
                <Link to="/me" className="inline-flex min-h-11 items-center rounded-full bg-sage-soft px-5 font-semibold text-sage-deep">Your token {token.token}</Link>
              ) : (
                s.status === 'ACTIVE' && <Button busy={queue.joiningId === s.id} onClick={() => queue.join(s)}>Join the queue now</Button>
              )}
              {nextFree && canBook && !existing && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDate(today.data.firstDate);
                    setPicked(nextFree);
                  }}
                >
                  Pick {timeLabel(nextFree.start)}
                </Button>
              )}
            </div>
          </section>

          <section aria-labelledby="quiet" className="card p-6 sm:p-7">
            <h2 id="quiet" className="text-2xl">Best time to go</h2>
            <p className="mb-4 mt-1 text-sm text-ink-muted">Typical wait by hour over the last four weeks.</p>
            {insights.loading ? <Spinner /> : <QuietHours insights={insights.data} />}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirming && Boolean(picked)}
        title="Book this time?"
        tone="primary"
        confirmLabel="Yes, book it"
        cancelLabel="Go back"
        busy={busy}
        onConfirm={book}
        onCancel={() => setConfirming(false)}
      >
        {picked && (
          <>
            <strong className="text-ink">{s.name}</strong> at {business.name}, {dateStringLabel(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })} at{' '}
            <strong className="text-ink">{timeLabel(picked.start)}</strong>. You'll get a booking code — tap "I'm here" when you arrive.
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
