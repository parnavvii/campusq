/**
 * Service catalogue: listing, detail, create/update (admin) and pause/resume (staff).
 * Every service belongs to one business; staff and admins only ever see their own.
 */
const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const { formatToken } = require('../utils/token');
const { timeToMinutes } = require('../utils/time');
const { loadQueueState, newJoinerPosition } = require('./estimate.service');
const { assignedServiceIds, assertCanManageService } = require('./access.service');

const SUMMARY_SQL = `
  SELECT s.*,
         COALESCE(SUM(q.status = 'WAITING'), 0)                      AS waiting_count,
         MAX(CASE WHEN q.status = 'SERVING' THEN q.token_number END) AS serving_number
    FROM services s
    LEFT JOIN queue_entries q
           ON q.service_id = s.id AND q.status IN ('WAITING', 'SERVING')`;

const hhmm = (t) => String(t).slice(0, 5);

async function toSummary(row, conn = pool) {
  const state = await loadQueueState(row, conn);
  const joiner = newJoinerPosition(state);
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    location: row.location,
    tokenPrefix: row.token_prefix,
    status: row.status,
    queueLength: Number(row.waiting_count),
    currentToken: row.serving_number ? formatToken(row.token_prefix, row.serving_number) : null,
    lastIssuedToken: row.last_token_number ? formatToken(row.token_prefix, row.last_token_number) : null,
    defaultServiceMinutes: Number(row.avg_service_minutes),
    avgServiceMinutes: Number(state.avg.minutes.toFixed(2)),
    estimateSource: state.avg.source,
    peopleAheadIfJoining: joiner.peopleAhead,
    bookingsAheadIfJoining: joiner.bookingsAhead,
    estimatedWaitMinutes: joiner.estimatedWaitMinutes,
    booking: {
      enabled: Boolean(row.booking_enabled),
      slotMinutes: Number(row.slot_minutes),
      slotCapacity: Number(row.slot_capacity),
      openTime: hhmm(row.open_time),
      closeTime: hhmm(row.close_time),
    },
    createdAt: row.created_at,
  };
}

async function getServiceSummary(serviceId, conn = pool) {
  const [rows] = await conn.query(`${SUMMARY_SQL} WHERE s.id = ? GROUP BY s.id`, [serviceId]);
  if (!rows.length) throw new AppError(404, MSG.SERVICE_NOT_FOUND);
  return toSummary(rows[0], conn);
}

/*
 * A business's service list is identical for every visitor, so it is computed
 * once and shared for a moment. Any queue change clears it (see socket/index.js),
 * so the cache only absorbs bursts — e.g. many screens refreshing at once.
 */
const LIST_CACHE_MS = 2000;
const listCache = new Map();
function invalidateSummaries() {
  listCache.clear();
}

async function allSummaries(businessId) {
  const hit = listCache.get(businessId);
  if (hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.data;
  const pending = (async () => {
    const [rows] = await pool.query(`${SUMMARY_SQL} WHERE s.business_id = ? GROUP BY s.id ORDER BY s.name`, [businessId]);
    return Promise.all(rows.map((r) => toSummary(r)));
  })();
  listCache.set(businessId, { at: Date.now(), data: pending });
  pending.catch(() => {
    if (listCache.get(businessId)?.data === pending) listCache.delete(businessId);
  });
  return pending;
}

async function assignedStaffByService(businessId) {
  const [rows] = await pool.query(
    `SELECT ss.service_id, u.id, u.name, u.email
       FROM staff_services ss JOIN users u ON u.id = ss.staff_id
      WHERE u.business_id = ?
      ORDER BY u.name`,
    [businessId]
  );
  const map = {};
  for (const r of rows) (map[r.service_id] ||= []).push({ id: r.id, name: r.name, email: r.email });
  return map;
}

/**
 * GET /api/services — staff and admins get their own business's services;
 * customers ask for one business (?business=<id>).
 */
async function listServices(user, businessId) {
  const scope = user.role === 'CUSTOMER' ? businessId : user.business_id;
  if (!scope) throw new AppError(400, MSG.CHOOSE_BUSINESS);
  const summaries = (await allSummaries(scope)).map((s) => ({ ...s, booking: { ...s.booking } }));

  if (user.role === 'STAFF') {
    const mine = new Set(await assignedServiceIds(user.id));
    summaries.forEach((s) => (s.canManage = mine.has(s.id)));
  } else if (user.role === 'ADMIN') {
    const staffMap = await assignedStaffByService(scope);
    summaries.forEach((s) => {
      s.canManage = true;
      s.assignedStaff = staffMap[s.id] || [];
    });
  }
  return summaries;
}

async function getService(user, serviceId) {
  const summary = await getServiceSummary(serviceId);
  if (user.role === 'ADMIN') {
    summary.canManage = summary.businessId === user.business_id;
    if (summary.canManage) summary.assignedStaff = (await assignedStaffByService(user.business_id))[serviceId] || [];
  } else if (user.role === 'STAFF') {
    summary.canManage = (await assignedServiceIds(user.id)).includes(serviceId);
  }
  return summary;
}

async function validateStaffIds(conn, staffIds, businessId) {
  if (!staffIds.length) return;
  const [rows] = await conn.query(`SELECT id FROM users WHERE role = 'STAFF' AND business_id = ? AND id IN (?)`, [businessId, staffIds]);
  if (rows.length !== new Set(staffIds).size) {
    throw new AppError(400, 'One or more selected staff members do not exist.');
  }
}

async function replaceAssignments(conn, serviceId, staffIds) {
  await conn.query('DELETE FROM staff_services WHERE service_id = ?', [serviceId]);
  for (const staffId of new Set(staffIds)) {
    await conn.query('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [staffId, serviceId]);
  }
}

function assertOpeningHours(openTime, closeTime, slotMinutes) {
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  if (close <= open) throw new AppError(400, 'Closing time must be after opening time.');
  if (close - open < slotMinutes) throw new AppError(400, 'Opening hours must fit at least one booking slot.');
}

function mapDuplicate(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    const field = /prefix/.test(err.message) ? 'token prefix' : 'name';
    return new AppError(409, `Another of your services already uses this ${field}.`);
  }
  return err;
}

const COLUMNS = {
  name: 'name',
  location: 'location',
  tokenPrefix: 'token_prefix',
  status: 'status',
  avgServiceMinutes: 'avg_service_minutes',
  bookingEnabled: 'booking_enabled',
  slotMinutes: 'slot_minutes',
  slotCapacity: 'slot_capacity',
  openTime: 'open_time',
  closeTime: 'close_time',
};

/** Admin: add a service to their own business. */
async function createService(user, data) {
  const booking = {
    bookingEnabled: data.bookingEnabled ?? true,
    slotMinutes: data.slotMinutes ?? 15,
    slotCapacity: data.slotCapacity ?? 1,
    openTime: data.openTime ?? '09:00',
    closeTime: data.closeTime ?? '17:00',
  };
  assertOpeningHours(booking.openTime, booking.closeTime, booking.slotMinutes);
  try {
    const id = await withTransaction(async (conn) => {
      const staffIds = data.staffIds || [];
      await validateStaffIds(conn, staffIds, user.business_id);
      const [r] = await conn.query(
        `INSERT INTO services (business_id, name, location, token_prefix, avg_service_minutes,
                               booking_enabled, slot_minutes, slot_capacity, open_time, close_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.business_id, data.name, data.location, data.tokenPrefix, data.avgServiceMinutes ?? 3, booking.bookingEnabled,
          booking.slotMinutes, booking.slotCapacity, booking.openTime, booking.closeTime]
      );
      await replaceAssignments(conn, r.insertId, staffIds);
      return r.insertId;
    });
    invalidateSummaries();
    return getService(user, id);
  } catch (err) {
    throw mapDuplicate(err);
  }
}

/** Admin: edit one of their own business's services. */
async function updateService(user, serviceId, data) {
  try {
    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM services WHERE id = ? AND business_id = ? FOR UPDATE', [serviceId, user.business_id]);
      if (!rows.length) throw new AppError(404, MSG.SERVICE_NOT_FOUND);
      const current = rows[0];
      assertOpeningHours(
        data.openTime ?? current.open_time,
        data.closeTime ?? current.close_time,
        data.slotMinutes ?? current.slot_minutes
      );

      const sets = [];
      const values = [];
      for (const [key, col] of Object.entries(COLUMNS)) {
        if (data[key] !== undefined) {
          sets.push(`${col} = ?`); // column names come from the whitelist above, never from input
          values.push(data[key]);
        }
      }
      if (sets.length) await conn.query(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`, [...values, serviceId]);
      if (Array.isArray(data.staffIds)) {
        await validateStaffIds(conn, data.staffIds, user.business_id);
        await replaceAssignments(conn, serviceId, data.staffIds);
      }
    });
    invalidateSummaries();
    return getService(user, serviceId);
  } catch (err) {
    throw mapDuplicate(err);
  }
}

async function setPaused(user, serviceId, paused) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT status FROM services WHERE id = ? FOR UPDATE', [serviceId]);
    if (!rows.length) throw new AppError(404, MSG.SERVICE_NOT_FOUND);
    await assertCanManageService(user, serviceId, conn);
    const { status } = rows[0];
    if (paused) {
      if (status === 'PAUSED') throw new AppError(409, MSG.ALREADY_PAUSED);
      if (status !== 'ACTIVE') throw new AppError(409, MSG.PAUSE_ONLY_ACTIVE);
    } else if (status !== 'PAUSED') {
      throw new AppError(409, MSG.NOT_PAUSED);
    }
    await conn.query('UPDATE services SET status = ? WHERE id = ?', [paused ? 'PAUSED' : 'ACTIVE', serviceId]);
  });
  invalidateSummaries();
  return getService(user, serviceId);
}

module.exports = {
  listServices,
  getService,
  getServiceSummary,
  allSummaries,
  invalidateSummaries,
  createService,
  updateService,
  setPaused,
};
