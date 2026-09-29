/**
 * Per-service authorization.
 *  - Admins manage every service of *their own* business (never another business's).
 *  - Staff manage only the services they are assigned to.
 *  - Customers never pass.
 */
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');

async function canManageService(user, serviceId, conn = pool) {
  if (user.role === 'ADMIN') {
    const [rows] = await conn.query('SELECT 1 FROM services WHERE id = ? AND business_id = ? LIMIT 1', [serviceId, user.business_id]);
    return rows.length > 0;
  }
  if (user.role !== 'STAFF') return false;
  const [rows] = await conn.query(
    'SELECT 1 FROM staff_services WHERE staff_id = ? AND service_id = ? LIMIT 1',
    [user.id, serviceId]
  );
  return rows.length > 0;
}

async function assertCanManageService(user, serviceId, conn = pool) {
  if (!(await canManageService(user, serviceId, conn))) {
    throw new AppError(403, MSG.NOT_AUTHORIZED_QUEUE);
  }
}

async function assignedServiceIds(userId) {
  const [rows] = await pool.query('SELECT service_id FROM staff_services WHERE staff_id = ?', [userId]);
  return rows.map((r) => r.service_id);
}

module.exports = { canManageService, assertCanManageService, assignedServiceIds };
