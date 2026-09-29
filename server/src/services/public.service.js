/**
 * Public, login-free views: the business directory, each business's page, the
 * waiting-area display board and token tracking for walk-in customers.
 * Only names of businesses and services, token numbers and counts are exposed —
 * never customers' names.
 */
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const { formatToken } = require('../utils/token');
const { ORDER_SQL, loadQueueState, positionFor } = require('./estimate.service');
const { allSummaries } = require('./catalog.service');
const { getBusinessBySlug } = require('./business.service');

const publicBusiness = (b) => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
  category: b.category,
  tagline: b.tagline,
  address: b.address,
  timezone: b.timezone,
  bookingDaysAhead: b.bookingDaysAhead,
  checkinEarlyMinutes: b.checkinEarlyMinutes,
  noShowMinutes: b.noShowMinutes,
});

/** GET /api/businesses?q=&category= — every business, with how busy it is right now. */
async function listBusinesses({ q, category } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(b.name LIKE ? OR b.tagline LIKE ? OR b.address LIKE ?)');
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    params.push(like, like, like);
  }
  if (category) {
    where.push('b.category = ?');
    params.push(category);
  }
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.slug, b.category, b.tagline, b.address
       FROM businesses b ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY b.name`,
    params
  );
  return Promise.all(
    rows.map(async (b) => {
      const services = await allSummaries(b.id);
      const open = services.filter((s) => s.status === 'ACTIVE');
      return {
        ...b,
        services: services.length,
        openServices: open.length,
        takesBookings: services.some((s) => s.booking.enabled && s.status !== 'CLOSED'),
        waitingNow: services.reduce((n, s) => n + s.queueLength, 0),
        shortestWaitMinutes: open.length ? Math.min(...open.map((s) => s.estimatedWaitMinutes)) : null,
      };
    })
  );
}

/** GET /api/businesses/:slug — a business and its services (live queue numbers). */
async function getBusinessPage(slug) {
  const business = await getBusinessBySlug(slug);
  return { business: publicBusiness(business), services: await allSummaries(business.id) };
}

/** GET /api/public/:slug/board — now serving + next tokens for every open service. */
async function getBoard(slug) {
  const business = await getBusinessBySlug(slug);
  const summaries = await allSummaries(business.id);
  const services = await Promise.all(
    summaries
      .filter((s) => s.status !== 'CLOSED')
      .map(async (s) => {
        const [next] = await pool.query(
          `SELECT token_number FROM queue_entries
            WHERE service_id = ? AND status = 'WAITING' ORDER BY ${ORDER_SQL} LIMIT 3`,
          [s.id]
        );
        return {
          id: s.id,
          name: s.name,
          location: s.location,
          status: s.status,
          currentToken: s.currentToken,
          queueLength: s.queueLength,
          estimatedWaitMinutes: s.estimatedWaitMinutes,
          nextTokens: next.map((n) => formatToken(s.tokenPrefix, n.token_number)),
        };
      })
  );
  return { business: publicBusiness(business), services, updatedAt: new Date() };
}

/** GET /api/public/:slug/track?serviceId=&token=H025 — live status of one token. */
async function trackToken(slug, serviceId, tokenText) {
  const business = await getBusinessBySlug(slug);
  const [[service]] = await pool.query('SELECT * FROM services WHERE id = ? AND business_id = ?', [serviceId, business.id]);
  if (!service) throw new AppError(404, MSG.SERVICE_NOT_FOUND);

  const match = /^([A-Za-z]{1,3})?0*(\d{1,6})$/.exec(String(tokenText).trim());
  if (!match || (match[1] && match[1].toUpperCase() !== service.token_prefix)) throw new AppError(404, MSG.TOKEN_NOT_FOUND);
  const [[entry]] = await pool.query(
    `SELECT * FROM queue_entries
      WHERE service_id = ? AND token_number = ? AND joined_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY`,
    [serviceId, Number(match[2])]
  );
  if (!entry) throw new AppError(404, MSG.TOKEN_NOT_FOUND);

  const state = await loadQueueState(service);
  const serving = state.entries.find((e) => e.status === 'SERVING');
  const active = ['WAITING', 'SERVING'].includes(entry.status);
  return {
    token: formatToken(service.token_prefix, entry.token_number),
    status: entry.status,
    serviceName: service.name,
    serviceLocation: service.location,
    serviceStatus: service.status,
    currentToken: serving ? formatToken(service.token_prefix, serving.token_number) : null,
    ...(active ? positionFor(entry, state) : { position: null, peopleAhead: null, estimatedWaitMinutes: null }),
  };
}

module.exports = { publicBusiness, listBusinesses, getBusinessPage, getBoard, trackToken };
