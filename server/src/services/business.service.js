/**
 * Businesses on the platform. Any kind of service business can sign up —
 * a salon, clinic, repair shop, office, help desk — and gets its own services,
 * staff, queues and bookings. Each keeps its own local time and booking rules.
 *
 * A business's row is read on almost every request, so it is cached briefly.
 */
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');

const CATEGORIES = ['SALON', 'CLINIC', 'REPAIR', 'OFFICE', 'HELPDESK', 'BANK', 'FOOD', 'OTHER'];
const CACHE_MS = 15 * 1000;
const cache = new Map();

const COLUMNS = {
  name: 'name',
  category: 'category',
  tagline: 'tagline',
  address: 'address',
  timezone: 'timezone',
  bookingDaysAhead: 'booking_days_ahead',
  checkinEarlyMinutes: 'checkin_early_minutes',
  noShowMinutes: 'no_show_minutes',
};

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    tagline: row.tagline,
    address: row.address,
    timezone: row.timezone,
    bookingDaysAhead: Number(row.booking_days_ahead),
    checkinEarlyMinutes: Number(row.checkin_early_minutes),
    noShowMinutes: Number(row.no_show_minutes),
    createdAt: row.created_at,
  };
}

async function getBusiness(id) {
  const hit = cache.get(Number(id));
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [[row]] = await pool.query('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!row) throw new AppError(404, MSG.BUSINESS_NOT_FOUND);
  const value = shape(row);
  cache.set(Number(id), { at: Date.now(), value });
  return value;
}

async function getBusinessBySlug(slug) {
  const [[row]] = await pool.query('SELECT id FROM businesses WHERE slug = ?', [slug]);
  if (!row) throw new AppError(404, MSG.BUSINESS_NOT_FOUND);
  return getBusiness(row.id);
}

/** The business that owns a service. */
async function getBusinessForService(serviceId, conn = pool) {
  const [[row]] = await conn.query('SELECT business_id FROM services WHERE id = ?', [serviceId]);
  if (!row) throw new AppError(404, MSG.SERVICE_NOT_FOUND);
  return getBusiness(row.business_id);
}

/** "Glow & Go Salon" → "glow-go-salon", made unique with -2, -3… */
async function uniqueSlug(name, conn) {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'business';
  const [rows] = await conn.query('SELECT slug FROM businesses WHERE slug = ? OR slug LIKE ?', [base, `${base}-%`]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Sign-up: creates the business and its first admin (the owner) together. */
async function registerBusiness({ business, owner }) {
  const hash = await bcrypt.hash(owner.password, env.bcryptRounds);
  try {
    return await withTransaction(async (conn) => {
      const slug = await uniqueSlug(business.name, conn);
      const [b] = await conn.query(
        `INSERT INTO businesses (name, slug, category, tagline, address, timezone) VALUES (?, ?, ?, ?, ?, ?)`,
        [business.name, slug, business.category || 'OTHER', business.tagline || '', business.address || '', business.timezone || 'Asia/Kolkata']
      );
      const [u] = await conn.query(
        `INSERT INTO users (business_id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'ADMIN')`,
        [b.insertId, owner.name, owner.email, owner.phone || null, hash]
      );
      return {
        businessId: b.insertId,
        user: { id: u.insertId, business_id: b.insertId, name: owner.name, email: owner.email, phone: owner.phone || null, role: 'ADMIN' },
      };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && /uq_users_email/.test(err.message)) throw new AppError(409, MSG.EMAIL_TAKEN);
    throw err;
  }
}

async function updateBusiness(id, data) {
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(COLUMNS)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = ?`); // column names come from the whitelist above
      values.push(data[key]);
    }
  }
  if (sets.length) await pool.query(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
  cache.delete(Number(id));
  return getBusiness(id);
}

module.exports = { CATEGORIES, getBusiness, getBusinessBySlug, getBusinessForService, registerBusiness, updateBusiness };
