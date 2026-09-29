/** The daily report, and each business's public (login-free) display board and token tracking. */
const rateLimit = require('express-rate-limit');
const h = require('../utils/asyncHandler');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/misc.controller');

const reports = require('express').Router();
reports.get('/daily', authenticate, requireRole('STAFF', 'ADMIN'), v.report, validate, h(ctrl.dailyReport));

// Public endpoints need no login, so they get their own gentle rate limit.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
const publicViews = require('express').Router();
publicViews.use(publicLimiter);
publicViews.get('/:slug/board', v.slugParam, validate, h(ctrl.board));
publicViews.get('/:slug/track', v.slugParam, v.track, validate, h(ctrl.track));

module.exports = { reports, publicViews };
