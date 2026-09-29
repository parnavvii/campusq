const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const { signToken } = require('../utils/jwt');
const { getBusiness } = require('./business.service');

// A real bcrypt hash used to keep login timing similar for unknown emails
// (reduces account-enumeration through response timing).
const DUMMY_HASH = bcrypt.hashSync('waitwell-timing-guard', 10);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null, role: u.role, businessId: u.business_id || null });

/** The user plus, for staff and admins, the business they work for. */
async function userWithBusiness(u) {
  const user = publicUser(u);
  if (u.business_id) {
    const b = await getBusiness(u.business_id);
    user.business = { id: b.id, name: b.name, slug: b.slug, category: b.category, timezone: b.timezone };
  }
  return user;
}

/** Self-registration always creates a CUSTOMER — roles can never be chosen by the client. */
async function register({ name, email, phone, password }) {
  const hash = await bcrypt.hash(password, env.bcryptRounds);
  try {
    const [r] = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'CUSTOMER')`,
      [name, email, phone || null, hash]
    );
    const user = { id: r.insertId, name, email, phone: phone || null, role: 'CUSTOMER' };
    return { token: signToken(user), user };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, MSG.EMAIL_TAKEN);
    throw err;
  }
}

async function login({ email, password }) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, MSG.INVALID_CREDENTIALS);
  return { token: signToken(user), user: await userWithBusiness(user) };
}

/** Every staff account in the admin's business, with the services each one runs. */
async function listStaff(businessId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.created_at, s.id AS service_id, s.name AS service_name
       FROM users u
       LEFT JOIN staff_services ss ON ss.staff_id = u.id
       LEFT JOIN services s ON s.id = ss.service_id
      WHERE u.role = 'STAFF' AND u.business_id = ?
      ORDER BY u.name, u.id, s.name`,
    [businessId]
  );
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, email: r.email, createdAt: r.created_at, services: [] });
    if (r.service_id) byId.get(r.id).services.push({ id: r.service_id, name: r.service_name });
  }
  return [...byId.values()];
}

/**
 * Admin-only: creates a STAFF login in the admin's business and assigns it to the
 * chosen services in one transaction. The role and business are fixed here —
 * they are never read from the request.
 */
async function createStaff(businessId, { name, email, password, serviceIds = [] }) {
  const ids = [...new Set(serviceIds)];
  const hash = await bcrypt.hash(password, env.bcryptRounds);
  try {
    return await withTransaction(async (conn) => {
      let services = [];
      if (ids.length) {
        [services] = await conn.query('SELECT id, name FROM services WHERE id IN (?) AND business_id = ? ORDER BY name', [ids, businessId]);
        if (services.length !== ids.length) throw new AppError(400, 'One or more selected services do not exist.');
      }
      const [r] = await conn.query(
        `INSERT INTO users (business_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'STAFF')`,
        [businessId, name, email, hash]
      );
      for (const s of services) {
        await conn.query('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [r.insertId, s.id]);
      }
      return { id: r.insertId, name, email, createdAt: new Date(), services };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, MSG.EMAIL_TAKEN);
    throw err;
  }
}

module.exports = { register, login, publicUser, userWithBusiness, listStaff, createStaff };
