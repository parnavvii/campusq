const router = require('express').Router();
const h = require('../utils/asyncHandler');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const MSG = require('../utils/messages');
const ctrl = require('../controllers/queue.controller');

router.use(authenticate);

// Customer endpoints (static paths are declared before "/:serviceId").
router.post('/join', requireRole('CUSTOMER'), v.joinQueue, validate, h(ctrl.join));
router.get('/my-position', requireRole('CUSTOMER'), h(ctrl.myPosition));
router.get('/my-history', requireRole('CUSTOMER'), h(ctrl.myHistory));
router.delete('/:queueId', requireRole('CUSTOMER'), v.idParam('queueId'), validate, h(ctrl.cancel));

// Any signed-in user; the response is limited for users who can't manage the service.
router.get('/:serviceId', v.idParam('serviceId', MSG.SERVICE_NOT_FOUND), validate, h(ctrl.getQueue));

// Staff queue controls — role check here, per-service assignment check in the service layer.
const staff = requireRole('STAFF', 'ADMIN');
router.post('/:serviceId/walk-in', staff, v.walkIn, validate, h(ctrl.walkIn));
router.post('/:serviceId/next', staff, v.idParam('serviceId', MSG.SERVICE_NOT_FOUND), validate, h(ctrl.callNext));
router.post('/:queueId/complete', staff, v.idParam('queueId'), validate, h(ctrl.complete));
router.post('/:queueId/skip', staff, v.idParam('queueId'), validate, h(ctrl.skip));

module.exports = router;
