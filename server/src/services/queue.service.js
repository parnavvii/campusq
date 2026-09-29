/**
 * Queue engine — all state transitions for tokens.
 *
 *   WAITING ──call next──▶ SERVING ──complete / call next──▶ COMPLETED
 *      │                      │
 *      ├──customer cancel──▶ CANCELLED
 *      └──staff skip───────┴──▶ SKIPPED
 *
 * Tokens come from three sources: ONLINE (customer joined from the app),
 * WALK_IN (staff added someone at the desk) and BOOKING (a booked customer
 * checked in). Order of service is defined in estimate.service.js.
 *
 * Concurrency: every mutation runs in a MySQL transaction that first locks the
 * service row (SELECT ... FOR UPDATE). Two customers joining at the same moment,
 * or a staff member double-clicking "Call Next", are therefore serialised, so
 * token numbers stay sequential and unique. UNIQUE indexes in the schema are a
 * second safety net (one active token per customer, one SERVING per service).
 */
const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const { formatToken } = require('../utils/token');
const { ORDER_SQL, orderSql, loadQueueState, positionFor } = require('./estimate.service');
const { assertCanManageService, canManageService } = require('./access.service');
const { getServiceSummary } = require('./catalog.service');

/* ----------------------------------------------------------------- helpers */

async function lockService(conn, serviceId) {
  const [rows] = await conn.query('SELECT * FROM services WHERE id = ? FOR UPDATE', [serviceId]);
  if (!rows.length) throw new AppError(404, MSG.SERVICE_NOT_FOUND);
  return rows[0];
}

/** Locks an entry and its service (service first, to keep a consistent lock order). */
async function lockEntryWithService(conn, queueId) {
  const [found] = await conn.query('SELECT service_id FROM queue_entries WHERE id = ?', [queueId]);
  if (!found.length) throw new AppError(404, MSG.INVALID_QUEUE_REQUEST);
  const service = await lockService(conn, found[0].service_id);
  const [rows] = await conn.query('SELECT * FROM queue_entries WHERE id = ? FOR UPDATE', [queueId]);
  return { entry: rows[0], service };
}

function assertAcceptingJoins(service) {
  if (service.status === 'PAUSED') throw new AppError(409, MSG.QUEUE_PAUSED);
  if (service.status !== 'ACTIVE') throw new AppError(409, MSG.SERVICE_CLOSED);
}

function serializeEntry(entry, prefix, extra = {}) {
  return {
    id: entry.id,
    serviceId: entry.service_id,
    userId: entry.user_id,
    token: formatToken(prefix, entry.token_number),
    tokenNumber: entry.token_number,
    status: entry.status,
    source: entry.source,
    bookedFor: entry.source === 'BOOKING' ? entry.queue_at : null,
    joinedAt: entry.joined_at,
    calledAt: entry.called_at,
    completedAt: entry.completed_at,
    cancelledAt: entry.cancelled_at,
    skippedAt: entry.skipped_at,
    ...extra,
  };
}

/**
 * Issues the next token for a locked service row. The only place tokens are
 * created, so numbering stays sequential whatever the source.
 */
async function issueToken(conn, service, { userId = null, guestName = null, guestPhone = null, source, appointmentId = null, queueAt = null }) {
  const tokenNumber = service.last_token_number + 1;
  await conn.query('UPDATE services SET last_token_number = ? WHERE id = ?', [tokenNumber, service.id]);
  service.last_token_number = tokenNumber;
  const [ins] = await conn.query(
    `INSERT INTO queue_entries (service_id, user_id, guest_name, guest_phone, source, appointment_id, token_number, queue_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP()))`,
    [service.id, userId, guestName, guestPhone, source, appointmentId, tokenNumber, queueAt]
  );
  const [[entry]] = await conn.query('SELECT * FROM queue_entries WHERE id = ?', [ins.insertId]);
  return entry;
}

/** Serialises a freshly issued entry with its live position. */
async function withPosition(conn, entry, service) {
  const state = await loadQueueState(service, conn);
  const serving = state.entries.find((e) => e.status === 'SERVING');
  return serializeEntry(entry, service.token_prefix, {
    serviceName: service.name,
    serviceLocation: service.location,
    serviceStatus: service.status,
    currentToken: serving ? formatToken(service.token_prefix, serving.token_number) : null,
    avgServiceMinutes: Number(state.avg.minutes.toFixed(2)),
    ...positionFor(entry, state),
  });
}

/* ----------------------------------------------------------- customer side */

async function joinQueue(user, serviceId) {
  if (user.role !== 'CUSTOMER') throw new AppError(403, MSG.CUSTOMERS_ONLY_JOIN);

  return withTransaction(async (conn) => {
    const service = await lockService(conn, serviceId);
    assertAcceptingJoins(service);

    const [existing] = await conn.query(
      `SELECT id FROM queue_entries WHERE service_id = ? AND user_id = ? AND status IN ('WAITING','SERVING')`,
      [serviceId, user.id]
    );
    if (existing.length) throw new AppError(409, MSG.ALREADY_IN_QUEUE);

    // Token generation happens only on the server, under the row lock.
    const entry = await issueToken(conn, service, { userId: user.id, source: 'ONLINE' });
    return withPosition(conn, entry, service);
  }).catch((err) => {
    // Safety net: the UNIQUE index caught a race the SELECT above didn't.
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, MSG.ALREADY_IN_QUEUE);
    throw err;
  });
}

/** Staff add a customer who is standing at the desk (no account or phone needed). */
async function addWalkIn(user, serviceId, { name, phone }) {
  return withTransaction(async (conn) => {
    const service = await lockService(conn, serviceId);
    await assertCanManageService(user, serviceId, conn);
    assertAcceptingJoins(service);
    const entry = await issueToken(conn, service, { guestName: name, guestPhone: phone || null, source: 'WALK_IN' });
    return withPosition(conn, entry, service);
  });
}

/** All of a customer's active tokens with live position + estimate. */
async function getMyPositions(user) {
  const [rows] = await pool.query(
    `SELECT q.*, s.id AS s_id, s.name AS s_name, s.location AS s_location, s.status AS s_status,
            s.token_prefix, s.avg_service_minutes, s.business_id,
            b.name AS business_name, b.slug AS business_slug, b.timezone AS business_timezone,
            a.code AS booking_code
       FROM queue_entries q
       JOIN services s ON s.id = q.service_id
       JOIN businesses b ON b.id = s.business_id
       LEFT JOIN appointments a ON a.id = q.appointment_id
      WHERE q.user_id = ? AND q.status IN ('WAITING','SERVING')
      ORDER BY q.joined_at`,
    [user.id]
  );
  const states = new Map();
  return Promise.all(
    rows.map(async (r) => {
      if (!states.has(r.s_id)) {
        states.set(r.s_id, loadQueueState({ id: r.s_id, business_id: r.business_id, avg_service_minutes: r.avg_service_minutes }));
      }
      const state = await states.get(r.s_id);
      const serving = state.entries.find((e) => e.status === 'SERVING');
      return serializeEntry(r, r.token_prefix, {
        serviceName: r.s_name,
        serviceLocation: r.s_location,
        serviceStatus: r.s_status,
        business: { id: r.business_id, name: r.business_name, slug: r.business_slug, timezone: r.business_timezone },
        bookingCode: r.booking_code,
        currentToken: serving ? formatToken(r.token_prefix, serving.token_number) : null,
        avgServiceMinutes: Number(state.avg.minutes.toFixed(2)),
        ...positionFor(r, state),
      });
    })
  );
}

async function getMyHistory(user, limit = 50) {
  const [rows] = await pool.query(
    `SELECT q.*, s.name AS s_name, s.location AS s_location, s.token_prefix,
            b.name AS business_name, b.slug AS business_slug, b.timezone AS business_timezone
       FROM queue_entries q JOIN services s ON s.id = q.service_id JOIN businesses b ON b.id = s.business_id
      WHERE q.user_id = ?
      ORDER BY q.joined_at DESC
      LIMIT ?`,
    [user.id, limit]
  );
  return rows.map((r) =>
    serializeEntry(r, r.token_prefix, {
      serviceName: r.s_name,
      serviceLocation: r.s_location,
      business: { name: r.business_name, slug: r.business_slug, timezone: r.business_timezone },
    })
  );
}

async function cancelEntry(user, queueId) {
  return withTransaction(async (conn) => {
    const { entry, service } = await lockEntryWithService(conn, queueId);
    if (entry.user_id !== user.id) throw new AppError(403, MSG.CANCEL_NOT_OWNER);
    if (entry.status === 'SERVING') throw new AppError(409, MSG.CANCEL_SERVING);
    if (entry.status === 'COMPLETED') throw new AppError(409, MSG.CANCEL_COMPLETED);
    if (entry.status !== 'WAITING') throw new AppError(409, MSG.TOKEN_NOT_ACTIVE);

    await conn.query(`UPDATE queue_entries SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = ?`, [queueId]);
    const [[updated]] = await conn.query('SELECT * FROM queue_entries WHERE id = ?', [queueId]);
    return serializeEntry(updated, service.token_prefix, { serviceName: service.name });
  });
}

/* -------------------------------------------------------------- staff side */

/**
 * Current SERVING → COMPLETED, next in line → SERVING.
 * Returns the affected entries so the caller can notify the customers.
 */
async function callNext(user, serviceId) {
  return withTransaction(async (conn) => {
    const service = await lockService(conn, serviceId);
    await assertCanManageService(user, serviceId, conn);
    if (service.status === 'PAUSED') throw new AppError(409, MSG.PAUSED_CALL_NEXT);
    if (service.status === 'CLOSED') throw new AppError(409, MSG.CLOSED_CALL_NEXT);

    const [[current]] = await conn.query(
      `SELECT * FROM queue_entries WHERE service_id = ? AND status = 'SERVING' FOR UPDATE`,
      [serviceId]
    );
    const [[next]] = await conn.query(
      `SELECT * FROM queue_entries WHERE service_id = ? AND status = 'WAITING'
        ORDER BY ${ORDER_SQL} LIMIT 1 FOR UPDATE`,
      [serviceId]
    );
    if (!current && !next) throw new AppError(409, MSG.NOBODY_WAITING);

    let completed = null;
    if (current) {
      await conn.query(`UPDATE queue_entries SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?`, [current.id]);
      completed = serializeEntry({ ...current, status: 'COMPLETED' }, service.token_prefix);
    }
    let serving = null;
    if (next) {
      await conn.query(`UPDATE queue_entries SET status = 'SERVING', called_at = NOW() WHERE id = ?`, [next.id]);
      const [[row]] = await conn.query('SELECT * FROM queue_entries WHERE id = ?', [next.id]);
      serving = serializeEntry(row, service.token_prefix, { guestName: row.guest_name });
    }
    return { serviceName: service.name, serviceLocation: service.location, completed, serving };
  });
}

async function completeEntry(user, queueId) {
  return withTransaction(async (conn) => {
    const { entry, service } = await lockEntryWithService(conn, queueId);
    await assertCanManageService(user, service.id, conn);
    if (entry.status !== 'SERVING') throw new AppError(409, MSG.COMPLETE_ONLY_SERVING);
    await conn.query(`UPDATE queue_entries SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?`, [queueId]);
    const [[row]] = await conn.query('SELECT * FROM queue_entries WHERE id = ?', [queueId]);
    return serializeEntry(row, service.token_prefix, { serviceName: service.name });
  });
}

/** A WAITING (or no-show SERVING) token becomes SKIPPED. */
async function skipEntry(user, queueId) {
  return withTransaction(async (conn) => {
    const { entry, service } = await lockEntryWithService(conn, queueId);
    await assertCanManageService(user, service.id, conn);
    if (!['WAITING', 'SERVING'].includes(entry.status)) throw new AppError(409, MSG.SKIP_ONLY_ACTIVE);
    await conn.query(`UPDATE queue_entries SET status = 'SKIPPED', skipped_at = NOW() WHERE id = ?`, [queueId]);
    const [[row]] = await conn.query('SELECT * FROM queue_entries WHERE id = ?', [queueId]);
    return serializeEntry(row, service.token_prefix, { serviceName: service.name });
  });
}

/**
 * The customer who is now first in line — they get a "you're next" heads-up.
 * Walk-ins have no account, so there is no one to notify for them.
 */
async function getHeadOfLine(serviceId) {
  const [[row]] = await pool.query(
    `SELECT * FROM queue_entries WHERE service_id = ? AND status = 'WAITING' ORDER BY ${ORDER_SQL} LIMIT 1`,
    [serviceId]
  );
  if (!row) return null;
  const [[service]] = await pool.query('SELECT name, token_prefix FROM services WHERE id = ?', [serviceId]);
  return serializeEntry(row, service.token_prefix, { serviceName: service.name });
}

/**
 * GET /api/queues/:serviceId
 *  - Assigned staff / admin: full list with customer names (for queue management).
 *  - Everyone else: "limited" view — token numbers only, no identities;
 *    a customer's own token is flagged with isMine.
 */
async function getQueue(user, serviceId) {
  const summary = await getServiceSummary(serviceId);
  const full = await canManageService(user, serviceId);

  const [active] = await pool.query(
    `SELECT q.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, a.code AS booking_code
       FROM queue_entries q
       LEFT JOIN users u ON u.id = q.user_id
       LEFT JOIN appointments a ON a.id = q.appointment_id
      WHERE q.service_id = ? AND q.status IN ('WAITING','SERVING')
      ORDER BY (q.status = 'SERVING') DESC, ${orderSql('q')}`,
    [serviceId]
  );

  const shape = (r, position) => {
    const base = {
      id: r.id,
      token: formatToken(summary.tokenPrefix, r.token_number),
      status: r.status,
      source: r.source,
      bookedFor: r.source === 'BOOKING' ? r.queue_at : null,
      position,
      joinedAt: r.joined_at,
      isMine: r.user_id !== null && r.user_id === user.id,
    };
    if (full) {
      Object.assign(base, {
        calledAt: r.called_at,
        bookingCode: r.booking_code,
        customer: {
          id: r.user_id,
          name: r.user_name || r.guest_name,
          email: r.user_email || null,
          phone: r.user_phone || r.guest_phone || null,
          isGuest: r.user_id === null,
        },
      });
    }
    return base;
  };

  const servingRow = active.find((r) => r.status === 'SERVING');
  const waitingRows = active.filter((r) => r.status === 'WAITING');
  const response = {
    service: { ...summary, canManage: full },
    view: full ? 'full' : 'limited',
    serving: servingRow ? shape(servingRow, 0) : null,
    waiting: waitingRows.map((r, i) => shape(r, i + 1 + (servingRow ? 1 : 0))),
  };

  if (full) {
    const [recent] = await pool.query(
      `SELECT q.*, COALESCE(u.name, q.guest_name) AS customer_name
         FROM queue_entries q LEFT JOIN users u ON u.id = q.user_id
        WHERE q.service_id = ? AND q.status IN ('COMPLETED','SKIPPED','CANCELLED')
        ORDER BY COALESCE(q.completed_at, q.skipped_at, q.cancelled_at) DESC
        LIMIT 8`,
      [serviceId]
    );
    response.recent = recent.map((r) => ({
      id: r.id,
      token: formatToken(summary.tokenPrefix, r.token_number),
      status: r.status,
      source: r.source,
      customerName: r.customer_name,
      finishedAt: r.completed_at || r.skipped_at || r.cancelled_at,
    }));
  }
  return response;
}

module.exports = {
  lockService,
  issueToken,
  withPosition,
  joinQueue,
  addWalkIn,
  getMyPositions,
  getMyHistory,
  cancelEntry,
  callNext,
  completeEntry,
  skipEntry,
  getQueue,
  getHeadOfLine,
};
