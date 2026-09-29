/**
 * Queue order and smart waiting-time estimation.
 *
 * Order of service (mirrored in SQL by ORDER_SQL):
 *   1. bookings whose slot time has arrived, earliest slot first;
 *   2. everyone else in the order they got in line (queue_at).
 * A booking keeps its slot: walk-ins fill the gaps between appointments.
 *
 *     estimated wait ≈ (people ahead + bookings that will become due first) × average service time
 *
 * "Average service time" is learned from history: the mean of
 * (completed_at − called_at) over the service's last 20 completed tokens.
 * Services with no history fall back to the admin-configured default.
 * Durations under 20 seconds are ignored as accidental double-clicks so a
 * burst of rapid "Call Next" presses can't distort the estimate.
 */
const { pool } = require('../config/db');
const { getBusiness } = require('./business.service');

const HISTORY_WINDOW = 20;
const MIN_VALID_SECONDS = 20;
const LOOKAHEAD_HOURS = 12;

/** SQL twin of compareEntries(): due bookings first, then by place in line. */
const orderSql = (alias = '') => {
  const c = alias ? `${alias}.` : '';
  return `(${c}source = 'BOOKING' AND ${c}queue_at <= UTC_TIMESTAMP()) DESC, ${c}queue_at, ${c}token_number`;
};
const ORDER_SQL = orderSql();

async function getAverageServiceMinutes(serviceId, fallbackMinutes, conn = pool) {
  const [rows] = await conn.query(
    `SELECT AVG(t.secs) AS avg_secs, COUNT(*) AS samples FROM (
        SELECT TIMESTAMPDIFF(SECOND, called_at, completed_at) AS secs
          FROM queue_entries
         WHERE service_id = ? AND status = 'COMPLETED'
           AND called_at IS NOT NULL AND completed_at IS NOT NULL
           AND TIMESTAMPDIFF(SECOND, called_at, completed_at) >= ?
         ORDER BY completed_at DESC
         LIMIT ?
     ) t`,
    [serviceId, MIN_VALID_SECONDS, HISTORY_WINDOW]
  );
  const { avg_secs: avgSecs, samples } = rows[0];
  if (!samples || avgSecs === null) {
    return { minutes: Number(fallbackMinutes), source: 'default', samples: 0 };
  }
  return { minutes: Number(avgSecs) / 60, source: 'history', samples: Number(samples) };
}

/**
 * Everything needed to place people in one service's line: active tokens,
 * bookings that haven't checked in yet, and the learned average service time.
 */
async function loadQueueState(service, conn = pool, now = new Date()) {
  const { noShowMinutes } = await getBusiness(service.business_id);
  const [entries] = await conn.query(
    `SELECT id, user_id, status, source, queue_at, token_number
       FROM queue_entries WHERE service_id = ? AND status IN ('WAITING','SERVING')`,
    [service.id]
  );
  const [pending] = await conn.query(
    `SELECT slot_start FROM appointments
      WHERE service_id = ? AND status = 'BOOKED' AND slot_start >= ? AND slot_start < ?`,
    [service.id, new Date(+now - noShowMinutes * 60000), new Date(+now + LOOKAHEAD_HOURS * 3600000)]
  );
  const avg = await getAverageServiceMinutes(service.id, service.avg_service_minutes, conn);
  return { now, avg, entries, pendingSlots: pending.map((p) => +new Date(p.slot_start)) };
}

const time = (v) => +new Date(v);
const isDueBooking = (e, now) => e.source === 'BOOKING' && time(e.queue_at) <= +now;
/** True when `a` is ahead of `b` by place in line (queue_at, then token number). */
const earlierInLine = (a, b) =>
  time(a.queue_at) < time(b.queue_at) || (time(a.queue_at) === time(b.queue_at) && a.token_number < b.token_number);

function compareEntries(a, b, now) {
  const da = isDueBooking(a, now) ? 0 : 1;
  const db = isDueBooking(b, now) ? 0 : 1;
  if (da !== db) return da - db;
  return earlierInLine(a, b) ? -1 : earlierInLine(b, a) ? 1 : 0;
}

/**
 * Position and estimate for one entry. `entry` may be virtual (a customer who
 * is about to join) — pass { id: 0, status: 'WAITING', source: 'ONLINE', queue_at: now, token_number: Infinity }.
 */
function positionFor(entry, state) {
  const { now, avg, entries, pendingSlots } = state;
  if (entry.status === 'SERVING') {
    return { position: 0, peopleAhead: 0, bookingsAhead: 0, estimatedWaitMinutes: 0 };
  }
  const minutes = avg.minutes;
  const others = entries.filter((e) => e.id !== entry.id);
  const serving = others.some((e) => e.status === 'SERVING') ? 1 : 0;
  const waiting = others.filter((e) => e.status === 'WAITING');

  if (entry.source === 'BOOKING') {
    // Served at its slot time, ahead of walk-ins: only the customer at the counter
    // and bookings with an earlier slot are in front.
    const bookedAhead = waiting.filter((e) => e.source === 'BOOKING' && earlierInLine(e, entry)).length;
    const pendingAhead = pendingSlots.filter((t) => t < time(entry.queue_at)).length;
    const peopleAhead = serving + bookedAhead;
    const untilSlot = Math.max(0, Math.ceil((time(entry.queue_at) - +now) / 60000));
    return {
      position: peopleAhead + 1,
      peopleAhead,
      bookingsAhead: pendingAhead,
      estimatedWaitMinutes: Math.max(untilSlot, Math.round((peopleAhead + pendingAhead) * minutes)),
    };
  }

  // Walk-in or online token: due bookings, then everyone who got in line earlier.
  const dueBooked = waiting.filter((e) => isDueBooking(e, now)).length;
  const lineAhead = waiting.filter((e) => e.source !== 'BOOKING' && earlierInLine(e, entry)).length;
  const peopleAhead = serving + dueBooked + lineAhead;

  // Bookings whose slot arrives before this customer reaches the counter will go first.
  const upcoming = [
    ...waiting.filter((e) => e.source === 'BOOKING' && !isDueBooking(e, now)).map((e) => time(e.queue_at)),
    ...pendingSlots.map((t) => Math.max(t, +now)),
  ];
  let bookingsAhead = 0;
  for (let i = 0; i < 50; i++) {
    const horizon = +now + (peopleAhead + bookingsAhead) * minutes * 60000;
    const due = upcoming.filter((t) => t <= horizon).length;
    if (due === bookingsAhead) break;
    bookingsAhead = due;
  }
  return {
    position: peopleAhead + 1,
    peopleAhead,
    bookingsAhead,
    estimatedWaitMinutes: Math.round((peopleAhead + bookingsAhead) * minutes),
  };
}

/** Where someone joining right now would stand. */
function newJoinerPosition(state) {
  return positionFor({ id: 0, status: 'WAITING', source: 'ONLINE', queue_at: state.now, token_number: Infinity }, state);
}

module.exports = {
  ORDER_SQL,
  orderSql,
  HISTORY_WINDOW,
  getAverageServiceMinutes,
  loadQueueState,
  positionFor,
  newJoinerPosition,
  compareEntries,
};
