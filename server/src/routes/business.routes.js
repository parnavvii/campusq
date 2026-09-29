const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const h = require('../utils/asyncHandler');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/business.controller');

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-ups from here. Please try again later.' },
});

// Public: anyone can browse businesses and sign one up.
router.get('/', v.directory, validate, h(ctrl.list));
router.post('/', signupLimiter, v.businessSignup, validate, h(ctrl.signup));

// The signed-in team member's own business (declared before "/:slug").
router.get('/mine', authenticate, requireRole('STAFF', 'ADMIN'), h(ctrl.mine));
router.put('/mine', authenticate, requireRole('ADMIN'), v.updateBusiness, validate, h(ctrl.updateMine));

router.get('/:slug', v.slugParam, validate, h(ctrl.page));

module.exports = router;
