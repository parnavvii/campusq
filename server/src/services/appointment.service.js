/**
 * Slot booking.
 *
 *   BOOKED ──check in (on arrival)──▶ CHECKED_IN  (a queue token is issued, served at slot time)
 *     │
 *     ├── customer cancels ──▶ CANCELLED
 *     └── not checked in by slot + grace ──▶ NO_SHOW  (marked by a background sweep)
 *
 * Slots are generated from each service's opening hours and slot length in its
 * business's local timezone; `slot_capacity` customers can book the same slot.
 * Bookings take the same service-row lock as the queue, so a slot can't be
 * over-booked by two customers pressing "Book" at the same moment.
 */
const crypto = require('crypto');
const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const { formatToken } = require('../utils/token');
const time = require('../utils/time');
const { getBusiness, getBusinessForService } = require('./business.service');
const { canManageService, assertCanManageService } = require('./access.service');
const { lockService, issueToken, withPosition } = require('./queue.service');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I look-alikes
const randomCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

/** Every slot start for one local date, from the service's opening hours. */
function slotTimes(service, dateStr, tz) {
  const open = time.timeToMinutes(service.open_time);
  const close = time.timeToMinutes(service.close_time);
  const step = Number(service.slot_minutes);
  const slots = [];
  for (let m = open; m + step <= close; m += step) {
    slots.push({ start: time.zonedToUtc(dateStr, m, tz), time: time.minutesToTime(m) });
  }
  return slots;
}

function bookingWindow(settings, now = new Date()) {
  const today = time.localDate(now, settings.timezone);
  return { today, lastDay: time.addDays(today, settings.bookingDaysAhead) };
}

function assertDateInWindow(dateStr, settings) {
  const { today, lastDay } = bookingWindow(settings);
  if (dateStr < today || dateStr > lastDay) throw new AppError(400, MSG.DATE_OUT_OF_RANGE);
}

function checkInWindow(slotStart, settings) {
  const start = +new Date(slotStart);
  return { opens: new Date(start - settings.checkinEarlyMinutes * 60000), closes: new Date(start + settings.noShowMinutes * 60000) };
}

function serialize(r, settings, now = new Date()) {
  const win = checkInWindow(r.slot_start, settings);
  return {
    id: r.id,
    code: r.code,
    business: { id: settings.id, name: settings.name, slug: settings.slug, timezone: settings.timezone },
    serviceId: r.service_id,
    serviceName: r.service_name,
    serviceLocation: r.service_location,
    slotStart: r.slot_start,
    status: r.status,
    createdAt: r.created_at,
    checkedInAt: r.checked_in_at,
    cancelledAt: r.cancelled_at,
    checkInOpensAt: win.opens,
    checkInClosesAt: win.closes,
    canCheckIn: r.status === 'BOOKED' && now >= win.opens && now <= win.closes,
    token: r.token_number ? formatToken(r.token_prefix, r.token_number) : null,
    queueEntryId: r.queue_entry_id || null,
    queueStatus: r.queue_status || null,
    ...(r.customer_name !== undefined && {
      customer: { id: r.user_id, name: r.customer_name, email: r.customer_email, phone: r.customer_phone },
    }),
  };
}

const SELECT_SQL = `
  SELECT a.*, s.name AS service_name, s.location AS service_location, s.token_prefix, s.business_id,
         q.id AS queue_entry_id, q.token_number, q.status AS queue_status
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    LEFT JOIN queue_entries q ON q.appointment_id = a.id`;

async function findOne(id, conn = pool) {
  const [[row]] = await conn.query(`${SELECT_SQL} WHERE a.id = ?`, [id]);
  return row;
}

/**
 * Marks bookings whose check-in window has closed as NO_SHOW.
 * Returns the affected rows so the caller can notify customers and staff.
 */
async function sweepNoShows() {
  // Each business has its own grace period.
  const [rows] = await pool.query(
    `SELECT a.id, a.service_id, a.user_id, a.code
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN businesses b ON b.id = s.business_id
      WHERE a.status = 'BOOKED' AND a.slot_start < UTC_TIMESTAMP() - INTERVAL b.no_show_minutes MINUTE`
  );
  if (rows.length) {
    await pool.query(`UPDATE appointments SET status = 'NO_SHOW' WHERE status = 'BOOKED' AND id IN (?)`, [rows.map((r) => r.id)]);
  }
  return rows;
}

/** GET /api/services/:id/slots?date=YYYY-MM-DD */
async function getSlots(user, serviceId, dateStr) {
  const settings = await getBusinessForService(serviceId);
  const tz = settings.timezone;
  const { today, lastDay } = bookingWindow(settings);
  const date = dateStr || today;
  assertDateInWindow(date, settings);

  const [[service]] = await pool.query('SELECT * FROM services WHERE id = ?', [serviceId]);
  if (!service) throw new AppError(404, MSG.SERVICE_NOT_FOUND);

  const base = { serviceId, businessId: settings.id, date, timezone: tz, firstDate: today, lastDate: lastDay, enabled: Boolean(service.booking_enabled), closed: service.status === 'CLOSED' };
  if (!service.booking_enabled) return { ...base, slots: [] };

  const slots = slotTimes(service, date, tz);
  const { start, end } = time.dayRange(date, tz);
  const [counts] = await pool.query(
    `SELECT slot_start, COUNT(*) AS booked, SUM(user_id = ?) AS mine
       FROM appointments
      WHERE service_id = ? AND status IN ('BOOKED','CHECKED_IN') AND slot_start >= ? AND slot_start < ?
      GROUP BY slot_start`,
    [user.id, serviceId, start, end]
  );
  const byStart = new Map(counts.map((c) => [+new Date(c.slot_start), c]));
  const now = Date.now();
  const capacity = Number(service.slot_capacity);
  return {
    ...base,
    slotMinutes: Number(service.slot_minutes),
    capacity,
    slots: slots.map((s) => {
      const c = byStart.get(+s.start);
      const booked = c ? Number(c.booked) : 0;
      return {
        start: s.start.toISOString(),
        time: s.time,
        booked,
        available: Math.max(0, capacity - booked),
        past: +s.start <= now,
        mine: Boolean(c && Number(c.mine)),
      };
    }),
  };
}

/** POST /api/appointments { serviceId, slotStart } */
async function book(user, { serviceId, slotStart }) {
  if (user.role !== 'CUSTOMER') throw new AppError(403, MSG.CUSTOMERS_ONLY_BOOK);
  const settings = await getBusinessForService(serviceId);
  const start = new Date(slotStart);
  if (Number.isNaN(+start)) throw new AppError(400, MSG.SLOT_INVALID);

  const id = await withTransaction(async (conn) => {
    const service = await lockService(conn, serviceId);
    if (!service.booking_enabled) throw new AppError(409, MSG.BOOKING_DISABLED);
    if (service.status === 'CLOSED') throw new AppError(409, MSG.SERVICE_CLOSED);

    const dateStr = time.localDate(start, settings.timezone);
    assertDateInWindow(dateStr, settings);
    if (+start <= Date.now()) throw new AppError(409, MSG.SLOT_PAST);
    if (!slotTimes(service, dateStr, settings.timezone).some((s) => +s.start === +start)) {
      throw new AppError(400, MSG.SLOT_INVALID);
    }

    const [[{ taken }]] = await conn.query(
      `SELECT COUNT(*) AS taken FROM appointments
        WHERE service_id = ? AND slot_start = ? AND status IN ('BOOKED','CHECKED_IN')`,
      [serviceId, start]
    );
    if (Number(taken) >= Number(service.slot_capacity)) throw new AppError(409, MSG.SLOT_FULL);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [r] = await conn.query(
          'INSERT INTO appointments (service_id, user_id, code, slot_start) VALUES (?, ?, ?, ?)',
          [serviceId, user.id, randomCode(), start]
        );
        return r.insertId;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
        if (/uq_one_booking_per_customer/.test(err.message)) throw new AppError(409, MSG.ALREADY_BOOKED);
        // otherwise the random code collided — try another one
      }
    }
    throw new Error('Could not generate a unique booking code');
  });
  return serialize(await findOne(id), settings);
}

/** GET /api/appointments/mine → upcoming bookings + recent past ones. */
/** Serialises rows that may belong to different businesses, each with its own rules. */
async function serializeMany(rows) {
  return Promise.all(rows.map(async (r) => serialize(r, await getBusiness(r.business_id))));
}

async function listMine(user) {
  const [upcoming] = await pool.query(`${SELECT_SQL} WHERE a.user_id = ? AND a.status = 'BOOKED' ORDER BY a.slot_start`, [user.id]);
  const [past] = await pool.query(
    `${SELECT_SQL} WHERE a.user_id = ? AND a.status <> 'BOOKED' ORDER BY a.slot_start DESC LIMIT 20`,
    [user.id]
  );
  return { upcoming: await serializeMany(upcoming), past: await serializeMany(past) };
}

/** DELETE /api/appointments/:id — the customer cancels their own upcoming booking. */
async function cancel(user, id) {
  const serviceId = await withTransaction(async (conn) => {
    const [[appt]] = await conn.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
    if (!appt) throw new AppError(404, MSG.BOOKING_NOT_FOUND);
    if (appt.user_id !== user.id) throw new AppError(403, MSG.BOOKING_NOT_OWNER);
    if (appt.status !== 'BOOKED') throw new AppError(409, MSG.BOOKING_NOT_ACTIVE);
    await conn.query(`UPDATE appointments SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = ?`, [id]);
    return appt.service_id;
  });
  return { serviceId, appointment: serialize(await findOne(id), await getBusinessForService(serviceId)) };
}

/**
 * POST /api/appointments/:id/check-in — by the customer (on arrival) or by staff at the desk.
 * Issues a queue token placed at the booking's slot time.
 */
async function checkIn(user, id) {
  const [[found]] = await pool.query('SELECT service_id FROM appointments WHERE id = ?', [id]);
  if (!found) throw new AppError(404, MSG.BOOKING_NOT_FOUND);
  const settings = await getBusinessForService(found.service_id);

  const result = await withTransaction(async (conn) => {
    const service = await lockService(conn, found.service_id); // same lock order as the queue
    const [[appt]] = await conn.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
    const isOwner = appt.user_id === user.id;
    if (!isOwner && !(await canManageService(user, service.id, conn))) throw new AppError(403, MSG.BOOKING_NOT_OWNER);
    if (appt.status === 'CHECKED_IN') throw new AppError(409, MSG.ALREADY_CHECKED_IN);
    if (appt.status === 'NO_SHOW') throw new AppError(409, MSG.CHECKIN_TOO_LATE);
    if (appt.status !== 'BOOKED') throw new AppError(409, MSG.BOOKING_NOT_ACTIVE);
    if (service.status === 'CLOSED') throw new AppError(409, MSG.SERVICE_CLOSED);

    const win = checkInWindow(appt.slot_start, settings);
    const now = new Date();
    if (now < win.opens) {
      const opens = win.opens.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: settings.timezone });
      throw new AppError(409, `Check-in opens at ${opens}, ${settings.checkinEarlyMinutes} minutes before your slot.`);
    }
    if (now > win.closes) throw new AppError(409, MSG.CHECKIN_TOO_LATE);

    let entry;
    try {
      entry = await issueToken(conn, service, { userId: appt.user_id, source: 'BOOKING', appointmentId: appt.id, queueAt: appt.slot_start });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, MSG.CUSTOMER_HAS_TOKEN);
      throw err;
    }
    await conn.query(`UPDATE appointments SET status = 'CHECKED_IN', checked_in_at = NOW() WHERE id = ?`, [id]);
    return { entry: await withPosition(conn, entry, service), userId: appt.user_id };
  });
  return { ...result, appointment: serialize(await findOne(id), settings) };
}

/** GET /api/services/:id/appointments?date= — the staff's list of the day's bookings. */
async function listForService(user, serviceId, dateStr) {
  await assertCanManageService(user, serviceId);
  const settings = await getBusinessForService(serviceId);
  const date = dateStr || time.localDate(new Date(), settings.timezone);
  const { start, end } = time.dayRange(date, settings.timezone);
  const [rows] = await pool.query(
    `SELECT a.*, s.name AS service_name, s.location AS service_location, s.token_prefix,
            q.id AS queue_entry_id, q.token_number, q.status AS queue_status,
            u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN queue_entries q ON q.appointment_id = a.id
      WHERE a.service_id = ? AND a.slot_start >= ? AND a.slot_start < ?
      ORDER BY a.slot_start, a.id`,
    [serviceId, start, end]
  );
  return { date, timezone: settings.timezone, appointments: rows.map((r) => serialize(r, settings)) };
}

module.exports = { slotTimes, sweepNoShows, getSlots, book, listMine, cancel, checkIn, listForService };
