/**
 * Statistics: the daily service report, per-service statistics and "best time
 * to visit" insights. Days and hours are counted in the business's local
 * timezone (a token at 00:30 IST belongs to that IST day, not the previous UTC day).
 */
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const time = require('../utils/time');
const { getBusiness, getBusinessForService } = require('./business.service');
const { assignedServiceIds, assertCanManageService } = require('./access.service');
const { getServiceSummary } = require('./catalog.service');

const MIN_SERVICE_SECONDS = 20;
const round1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const minutesBetween = (a, b) => (+new Date(b) - +new Date(a)) / 60000;
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** Wait = from getting in line (or the booked slot, if later) until being called. */
function waitMinutes(e) {
  if (!e.called_at) return null;
  const from = Math.max(+new Date(e.joined_at), +new Date(e.queue_at));
  return Math.max(0, (+new Date(e.called_at) - from) / 60000);
}

function emptyCounts() {
  return { issued: 0, served: 0, cancelled: 0, skipped: 0, active: 0, online: 0, walkIn: 0, booked: 0, waits: [], services: [] };
}

function tally(bucket, e) {
  bucket.issued++;
  if (e.status === 'COMPLETED') bucket.served++;
  else if (e.status === 'CANCELLED') bucket.cancelled++;
  else if (e.status === 'SKIPPED') bucket.skipped++;
  else bucket.active++;
  if (e.source === 'WALK_IN') bucket.walkIn++;
  else if (e.source === 'BOOKING') bucket.booked++;
  else bucket.online++;
  const w = waitMinutes(e);
  if (w !== null) bucket.waits.push(w);
  if (e.status === 'COMPLETED' && e.called_at && e.completed_at) {
    const s = minutesBetween(e.called_at, e.completed_at);
    if (s * 60 >= MIN_SERVICE_SECONDS) bucket.services.push(s);
  }
}

function finish(bucket, bookings) {
  const { waits, services, ...counts } = bucket;
  return {
    ...counts,
    avgWaitMinutes: round1(mean(waits)),
    maxWaitMinutes: waits.length ? round1(Math.max(...waits)) : null,
    avgServiceMinutes: round1(mean(services)),
    bookings,
  };
}

function bookingCounts(rows) {
  const c = { total: 0, checkedIn: 0, noShow: 0, cancelled: 0, upcoming: 0 };
  for (const r of rows) {
    c.total++;
    if (r.status === 'CHECKED_IN') c.checkedIn++;
    else if (r.status === 'NO_SHOW') c.noShow++;
    else if (r.status === 'CANCELLED') c.cancelled++;
    else c.upcoming++;
  }
  return c;
}

/**
 * Services the user may report on (admins: all; staff: assigned ones), and the
 * subset the report covers (one service if serviceId is given).
 */
async function visibleServices(user, serviceId) {
  const [all] = await pool.query(
    'SELECT id, name, token_prefix, open_time, close_time FROM services WHERE business_id = ? ORDER BY name',
    [user.business_id]
  );
  let allowed = all;
  if (user.role === 'STAFF') {
    const mine = new Set(await assignedServiceIds(user.id));
    allowed = all.filter((s) => mine.has(s.id));
  }
  if (!serviceId) return { allowed, selected: allowed };
  if (!all.some((s) => s.id === serviceId)) throw new AppError(404, MSG.SERVICE_NOT_FOUND);
  const selected = allowed.filter((s) => s.id === serviceId);
  if (!selected.length) throw new AppError(403, MSG.NOT_AUTHORIZED_QUEUE);
  return { allowed, selected };
}

/** GET /api/reports/daily?date=YYYY-MM-DD&serviceId= */
async function getDailyReport(user, { date: dateStr, serviceId } = {}) {
  const business = await getBusiness(user.business_id);
  const tz = business.timezone;
  const today = time.localDate(new Date(), tz);
  const date = dateStr || today;
  const { allowed, selected: services } = await visibleServices(user, serviceId);
  const ids = services.map((s) => s.id);
  const { start, end } = time.dayRange(date, tz);
  const trendStart = time.dayRange(time.addDays(date, -6), tz).start;

  const [entries] = ids.length
    ? await pool.query(
        `SELECT service_id, status, source, joined_at, queue_at, called_at, completed_at
           FROM queue_entries WHERE service_id IN (?) AND joined_at >= ? AND joined_at < ?`,
        [ids, trendStart, end]
      )
    : [[]];
  const [appts] = ids.length
    ? await pool.query(
        `SELECT service_id, status, slot_start FROM appointments
          WHERE service_id IN (?) AND slot_start >= ? AND slot_start < ?`,
        [ids, start, end]
      )
    : [[]];

  const inDay = (d) => d && +new Date(d) >= +start && +new Date(d) < +end;
  const dayEntries = entries.filter((e) => inDay(e.joined_at));

  // Totals and per-service breakdown.
  const total = emptyCounts();
  const per = new Map(services.map((s) => [s.id, emptyCounts()]));
  for (const e of dayEntries) {
    tally(total, e);
    tally(per.get(e.service_id), e);
  }

  // Hour-by-hour (local time): tokens issued by join hour, served by completion hour.
  const hours = new Map();
  const hourBucket = (h) => {
    if (!hours.has(h)) hours.set(h, { hour: h, label: hourLabel(h), issued: 0, served: 0, waits: [] });
    return hours.get(h);
  };
  for (const e of dayEntries) {
    const b = hourBucket(Math.floor(time.localMinutes(new Date(e.joined_at), tz) / 60));
    b.issued++;
    const w = waitMinutes(e);
    if (w !== null) b.waits.push(w);
  }
  for (const e of entries) {
    if (e.status === 'COMPLETED' && inDay(e.completed_at)) {
      hourBucket(Math.floor(time.localMinutes(new Date(e.completed_at), tz) / 60)).served++;
    }
  }
  // Always show the centre's opening hours, plus any hour that had activity.
  if (services.length) {
    const open = Math.min(...services.map((s) => Math.floor(time.timeToMinutes(s.open_time) / 60)));
    const close = Math.max(...services.map((s) => Math.ceil(time.timeToMinutes(s.close_time) / 60)));
    for (let h = open; h < Math.min(close, 24); h++) hourBucket(h);
  }
  const hourly = [...hours.values()]
    .sort((a, b) => a.hour - b.hour)
    .map(({ waits, ...h }) => ({ ...h, avgWaitMinutes: round1(mean(waits)) }));
  const busiest = hourly.reduce((best, h) => (h.issued > (best?.issued || 0) ? h : best), null);

  // Seven-day trend ending on the selected date.
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = time.addDays(date, -i);
    trend.push({ date: d, issued: 0, served: 0 });
  }
  const trendByDate = new Map(trend.map((t) => [t.date, t]));
  for (const e of entries) {
    const t = trendByDate.get(time.localDate(new Date(e.joined_at), tz));
    if (t) {
      t.issued++;
      if (e.status === 'COMPLETED') t.served++;
    }
  }

  return {
    date,
    timezone: tz,
    business: { id: business.id, name: business.name },
    isToday: date === today,
    services: allowed.map((s) => ({ id: s.id, name: s.name, tokenPrefix: s.token_prefix })), // for the service picker
    totals: finish(total, bookingCounts(appts)),
    byService: services.map((s) => ({
      id: s.id,
      name: s.name,
      tokenPrefix: s.token_prefix,
      ...finish(per.get(s.id), bookingCounts(appts.filter((a) => a.service_id === s.id))),
    })),
    hourly,
    busiestHour: busiest && busiest.issued ? { hour: busiest.hour, label: busiest.label, issued: busiest.issued } : null,
    trend,
  };
}

/** GET /api/services/:id/statistics — all-time totals plus today's report for one service. */
async function getStatistics(user, serviceId) {
  const summary = await getServiceSummary(serviceId); // 404 if missing
  await assertCanManageService(user, serviceId);

  const [[totals]] = await pool.query(
    `SELECT COUNT(*)                               AS total_tokens,
            COALESCE(SUM(status = 'COMPLETED'), 0) AS served,
            COALESCE(SUM(status = 'WAITING'), 0)   AS waiting,
            COALESCE(SUM(status = 'SERVING'), 0)   AS serving,
            COALESCE(SUM(status = 'CANCELLED'), 0) AS cancelled,
            COALESCE(SUM(status = 'SKIPPED'), 0)   AS skipped,
            AVG(CASE WHEN called_at IS NOT NULL
                     THEN TIMESTAMPDIFF(SECOND, GREATEST(joined_at, queue_at), called_at) END) / 60 AS avg_wait_min
       FROM queue_entries WHERE service_id = ?`,
    [serviceId]
  );
  const day = await getDailyReport(user, { serviceId });

  return {
    service: summary,
    totals: {
      totalTokens: Number(totals.total_tokens),
      served: Number(totals.served),
      waiting: Number(totals.waiting),
      serving: Number(totals.serving),
      cancelled: Number(totals.cancelled),
      skipped: Number(totals.skipped),
      avgWaitMinutes: round1(Number(totals.avg_wait_min)),
      avgServiceMinutes: round1(summary.avgServiceMinutes),
    },
    today: {
      issued: day.totals.issued,
      served: day.totals.served,
      cancelled: day.totals.cancelled,
      skipped: day.totals.skipped,
      avgWaitMinutes: day.totals.avgWaitMinutes,
      bookings: day.totals.bookings,
    },
    servedOverTime: day.trend.map((t) => ({ date: t.date, served: t.served })),
  };
}

/**
 * GET /api/services/:id/insights — typical wait by hour over the last 4 weeks,
 * so customers can pick a quiet time ("usually quietest around 3 PM").
 */
async function getInsights(serviceId) {
  const tz = (await getBusinessForService(serviceId)).timezone;
  const [[service]] = await pool.query('SELECT id, open_time, close_time FROM services WHERE id = ?', [serviceId]);
  if (!service) throw new AppError(404, MSG.SERVICE_NOT_FOUND);

  const [rows] = await pool.query(
    `SELECT joined_at, queue_at, called_at FROM queue_entries
      WHERE service_id = ? AND source <> 'BOOKING' AND called_at IS NOT NULL
        AND joined_at >= UTC_TIMESTAMP() - INTERVAL 28 DAY`,
    [serviceId]
  );
  const open = Math.floor(time.timeToMinutes(service.open_time) / 60);
  const close = Math.min(24, Math.ceil(time.timeToMinutes(service.close_time) / 60));
  const byHour = new Map();
  for (let h = open; h < close; h++) byHour.set(h, []);
  for (const r of rows) {
    const h = Math.floor(time.localMinutes(new Date(r.joined_at), tz) / 60);
    if (byHour.has(h)) byHour.get(h).push(waitMinutes(r));
  }
  const hours = [...byHour.entries()].map(([hour, waits]) => ({
    hour,
    label: hourLabel(hour),
    samples: waits.length,
    avgWaitMinutes: round1(mean(waits)),
  }));
  const withData = hours.filter((h) => h.samples >= 2);
  const quietest = withData.length ? withData.reduce((a, b) => (b.avgWaitMinutes < a.avgWaitMinutes ? b : a)) : null;
  const busiest = withData.length ? withData.reduce((a, b) => (b.avgWaitMinutes > a.avgWaitMinutes ? b : a)) : null;
  return { serviceId, timezone: tz, samples: rows.length, hours, quietestHour: quietest, busiestHour: busiest };
}

module.exports = { getDailyReport, getStatistics, getInsights };
