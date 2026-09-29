/**
 * Input validation + sanitisation rules (express-validator).
 * These run on the server even though the React forms validate too.
 */
const { body, param, query } = require('express-validator');
const MSG = require('../utils/messages');
const { isValidTimeZone, isValidDateString } = require('../utils/time');

const stripTags = (v) => (typeof v === 'string' ? v.replace(/[<>]/g, '') : v);
const CATEGORIES = ['SALON', 'CLINIC', 'REPAIR', 'OFFICE', 'HELPDESK', 'BANK', 'FOOD', 'OTHER'];

const idParam = (name, message = MSG.INVALID_QUEUE_REQUEST) =>
  param(name).isInt({ min: 1, max: 2147483647 }).withMessage(message).bail().toInt();

const email = () =>
  body('email')
    .isString().withMessage('Enter a valid email address.').bail()
    .trim().toLowerCase()
    .isEmail().withMessage('Enter a valid email address.')
    .isLength({ max: 191 }).withMessage('Email is too long.');

const personName = (field = 'name', label = 'Name') =>
  body(field)
    .isString().withMessage(`${label} is required.`).bail()
    .trim().customSanitizer(stripTags)
    .isLength({ min: 2, max: 100 }).withMessage(`${label} must be between 2 and 100 characters.`);

const phone = () =>
  body('phone')
    .optional({ values: 'falsy' })
    .isString().withMessage('Enter a valid phone number.').bail()
    .trim()
    .matches(/^\+?[0-9][0-9 -]{6,18}[0-9]$/).withMessage('Enter a valid phone number (digits, spaces or dashes).');

const password = () =>
  body('password')
    .isString().withMessage('Password is required.').bail()
    .isLength({ min: 8, max: 72 }).withMessage('Password must be 8–72 characters long.')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter.')
    .matches(/\d/).withMessage('Password must contain at least one number.');

const register = [personName(), email(), phone(), password()];

// Admin-created staff login: same account rules as registration, plus optional service assignments.
const createStaff = [
  ...register,
  body('serviceIds').optional().isArray({ max: 50 }).withMessage('serviceIds must be a list of service ids.'),
  body('serviceIds.*').isInt({ min: 1 }).withMessage('serviceIds must contain valid ids.').toInt(),
];

// Empty-field check produces a single clear message; format check follows.
const login = [
  body(['email', 'password'])
    .custom((v) => typeof v === 'string' && v.trim() !== '')
    .withMessage(MSG.LOGIN_FIELDS_REQUIRED),
  body('email').trim().toLowerCase(),
];

const joinQueue = [
  body('serviceId').isInt({ min: 1, max: 2147483647 }).withMessage('Please choose a valid service.').toInt(),
];

const walkIn = [
  idParam('serviceId', MSG.SERVICE_NOT_FOUND),
  personName('name', "Customer's name"),
  phone(),
];

const clockTime = (field, label, { allowMidnightEnd = false } = {}) =>
  body(field)
    .optional()
    .isString().bail()
    .matches(allowMidnightEnd ? /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/ : /^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage(`${label} must look like 09:30.`);

const serviceFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    opt(body('name'))
      .isString().withMessage('Service name is required.').bail()
      .trim().customSanitizer(stripTags)
      .isLength({ min: 2, max: 100 }).withMessage('Service name must be 2–100 characters.'),
    opt(body('location'))
      .isString().withMessage('Location is required.').bail()
      .trim().customSanitizer(stripTags)
      .isLength({ min: 2, max: 150 }).withMessage('Location must be 2–150 characters.'),
    opt(body('tokenPrefix'))
      .isString().withMessage('Token prefix is required.').bail()
      .trim().toUpperCase()
      .matches(/^[A-Z]{1,3}$/).withMessage('Token prefix must be 1–3 letters (e.g. A).'),
    body('avgServiceMinutes')
      .optional()
      .isFloat({ min: 0.5, max: 240 }).withMessage('Average service time must be between 0.5 and 240 minutes.')
      .toFloat(),
    body('bookingEnabled').optional().isBoolean().withMessage('bookingEnabled must be true or false.').toBoolean(),
    body('slotMinutes').optional().isInt({ min: 5, max: 240 }).withMessage('Slot length must be 5–240 minutes.').toInt(),
    body('slotCapacity').optional().isInt({ min: 1, max: 50 }).withMessage('Customers per slot must be 1–50.').toInt(),
    clockTime('openTime', 'Opening time'),
    clockTime('closeTime', 'Closing time', { allowMidnightEnd: true }),
    body('staffIds').optional().isArray({ max: 50 }).withMessage('staffIds must be a list of staff ids.'),
    body('staffIds.*').isInt({ min: 1 }).withMessage('staffIds must contain valid ids.').toInt(),
  ];
};

const createService = serviceFields(false);
const updateService = [
  idParam('id', MSG.SERVICE_NOT_FOUND),
  ...serviceFields(true),
  body('status').optional().isIn(['ACTIVE', 'PAUSED', 'CLOSED']).withMessage('Status must be ACTIVE, PAUSED or CLOSED.'),
];

const dateQuery = query('date')
  .optional()
  .custom((v) => isValidDateString(v)).withMessage('Date must look like 2026-09-29.');

const book = [
  body('serviceId').isInt({ min: 1, max: 2147483647 }).withMessage('Please choose a valid service.').toInt(),
  body('slotStart').isISO8601().withMessage(MSG.SLOT_INVALID),
];

const businessText = (field, label, max) =>
  body(field).optional().isString().bail().trim().customSanitizer(stripTags)
    .isLength({ max }).withMessage(`${label} must be at most ${max} characters.`);
const timezone = () =>
  body('timezone').optional().isString().bail().trim()
    .custom((v) => isValidTimeZone(v)).withMessage('Choose a valid timezone, e.g. Asia/Kolkata.');
const category = () => body('category').optional().isIn(CATEGORIES).withMessage('Choose what kind of business this is.');

// A business signs up: its details plus the owner's (first admin's) account.
const businessSignup = [
  personName('businessName', 'Business name'),
  category(),
  businessText('tagline', 'Short description', 200),
  businessText('address', 'Address', 200),
  timezone(),
  personName('name', 'Your name'),
  email(),
  phone(),
  password(),
];

const updateBusiness = [
  body('name').optional().isString().bail().trim().customSanitizer(stripTags)
    .isLength({ min: 2, max: 100 }).withMessage('Business name must be 2–100 characters.'),
  category(),
  businessText('tagline', 'Short description', 200),
  businessText('address', 'Address', 200),
  timezone(),
  body('bookingDaysAhead').optional().isInt({ min: 0, max: 60 }).withMessage('Booking window must be 0–60 days.').toInt(),
  body('checkinEarlyMinutes').optional().isInt({ min: 0, max: 240 }).withMessage('Early check-in must be 0–240 minutes.').toInt(),
  body('noShowMinutes').optional().isInt({ min: 0, max: 120 }).withMessage('No-show grace must be 0–120 minutes.').toInt(),
];

const report = [
  dateQuery,
  query('serviceId').optional().isInt({ min: 1 }).withMessage(MSG.SERVICE_NOT_FOUND).toInt(),
];

const directory = [
  query('q').optional().isString().bail().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
  query('category').optional({ values: 'falsy' }).isIn(CATEGORIES).withMessage('Unknown category.'),
];

const slugParam = param('slug').isString().bail().matches(/^[a-z0-9-]{1,80}$/).withMessage('We could not find that business.');

const servicesQuery = query('business').optional().isInt({ min: 1 }).withMessage(MSG.BUSINESS_NOT_FOUND).toInt();

const track = [
  query('serviceId').isInt({ min: 1 }).withMessage(MSG.SERVICE_NOT_FOUND).toInt(),
  query('token').isString().trim().matches(/^[A-Za-z]{0,3}\d{1,6}$/).withMessage('Enter a token like H025.'),
];

module.exports = {
  idParam,
  register,
  createStaff,
  login,
  joinQueue,
  walkIn,
  createService,
  updateService,
  dateQuery,
  book,
  businessSignup,
  updateBusiness,
  directory,
  slugParam,
  servicesQuery,
  report,
  track,
};
