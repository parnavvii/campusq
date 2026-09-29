const router = require('express').Router();
const h = require('../utils/asyncHandler');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const MSG = require('../utils/messages');
const ctrl = require('../controllers/service.controller');

const serviceId = v.idParam('id', MSG.SERVICE_NOT_FOUND);

router.use(authenticate);

router.get('/', v.servicesQuery, validate, h(ctrl.list));
router.get('/:id', serviceId, validate, h(ctrl.get));
router.post('/', requireRole('ADMIN'), v.createService, validate, h(ctrl.create));
router.put('/:id', requireRole('ADMIN'), v.updateService, validate, h(ctrl.update));

// Booking availability and "best time to visit" — any signed-in user.
router.get('/:id/slots', serviceId, v.dateQuery, validate, h(ctrl.slots));
router.get('/:id/insights', serviceId, validate, h(ctrl.insights));

// Staff controls — role check here, per-service assignment check in the service layer.
const staff = requireRole('STAFF', 'ADMIN');
router.post('/:id/pause', staff, serviceId, validate, h(ctrl.pause));
router.post('/:id/resume', staff, serviceId, validate, h(ctrl.resume));
router.get('/:id/statistics', staff, serviceId, validate, h(ctrl.statistics));
router.get('/:id/appointments', staff, serviceId, v.dateQuery, validate, h(ctrl.appointments));

module.exports = router;
