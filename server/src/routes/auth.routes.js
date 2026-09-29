const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const h = require('../utils/asyncHandler');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

// Throttle credential endpoints to slow down brute-force attempts.
const limiterOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
};
// Login is limited per IP *and* email: many customers often share one public IP
// (shop or campus Wi-Fi), so one person's typos must not lock everyone else out.
const loginLimiter = rateLimit({
  ...limiterOptions,
  limit: 20,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`,
});
const registerLimiter = rateLimit({ ...limiterOptions, limit: 100 });

router.post('/register', registerLimiter, v.register, validate, h(ctrl.register));
router.post('/login', loginLimiter, v.login, validate, h(ctrl.login));
router.get('/me', authenticate, h(ctrl.me));
router.get('/staff', authenticate, requireRole('ADMIN'), h(ctrl.listStaff));
router.post('/staff', authenticate, requireRole('ADMIN'), v.createStaff, validate, h(ctrl.createStaff));

module.exports = router;
