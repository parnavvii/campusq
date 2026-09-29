const router = require('express').Router();
const h = require('../utils/asyncHandler');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const MSG = require('../utils/messages');
const ctrl = require('../controllers/appointment.controller');

const bookingId = v.idParam('id', MSG.BOOKING_NOT_FOUND);

router.use(authenticate);

router.post('/', requireRole('CUSTOMER'), v.book, validate, h(ctrl.book));
router.get('/mine', requireRole('CUSTOMER'), h(ctrl.mine));
router.delete('/:id', requireRole('CUSTOMER'), bookingId, validate, h(ctrl.cancel));
// The customer checks in on arrival, or staff check them in at the desk.
router.post('/:id/check-in', bookingId, validate, h(ctrl.checkIn));

module.exports = router;
