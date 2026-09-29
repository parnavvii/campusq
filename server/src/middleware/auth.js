/**
 * Authentication + role-based authorization middleware.
 *  - authenticate: verifies the Bearer JWT and re-loads the user from MySQL
 *    (so deleted users or changed roles take effect immediately).
 *  - requireRole: allows only the listed roles.
 * Per-service staff permission checks live in services/access.service.js.
 */
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const MSG = require('../utils/messages');
const { verifyToken } = require('../utils/jwt');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new AppError(401, MSG.AUTH_REQUIRED);

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new AppError(401, MSG.SESSION_EXPIRED);
    }

    const [rows] = await pool.query('SELECT id, business_id, name, email, phone, role FROM users WHERE id = ?', [payload.sub]);
    if (!rows.length) throw new AppError(401, MSG.SESSION_EXPIRED);

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      // Staff-only queue controls get the PRD's specific message.
      const staffOnly = roles.includes('STAFF') && !roles.includes('CUSTOMER');
      return next(new AppError(403, staffOnly ? MSG.NOT_AUTHORIZED_QUEUE : MSG.FORBIDDEN));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
