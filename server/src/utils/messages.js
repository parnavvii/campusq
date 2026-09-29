/** User-facing error messages, kept in one place so the API and tests agree on wording. */
module.exports = {
  ALREADY_IN_QUEUE: 'You are already in this queue.',
  QUEUE_PAUSED: 'This queue is currently paused. Please try again later.',
  INVALID_QUEUE_REQUEST: 'Invalid queue request.',
  NOT_AUTHORIZED_QUEUE: 'You are not authorized to manage this queue.',
  LOGIN_FIELDS_REQUIRED: 'Email and password are required.',

  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  AUTH_REQUIRED: 'Please log in to continue.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  SERVICE_NOT_FOUND: 'Service not found.',
  SERVICE_CLOSED: 'This service is currently closed.',
  CUSTOMERS_ONLY_JOIN: 'Only customers can join a queue.',
  CANCEL_NOT_OWNER: 'You can only cancel your own queue request.',
  CANCEL_SERVING: 'Your token is being served right now and cannot be cancelled. Please speak to the staff.',
  CANCEL_COMPLETED: 'A completed token cannot be cancelled.',
  TOKEN_NOT_ACTIVE: 'This token is no longer active.',
  PAUSED_CALL_NEXT: 'This queue is paused. Resume it before calling the next token.',
  CLOSED_CALL_NEXT: 'This service is closed. Reopen it before calling the next token.',
  NOBODY_WAITING: 'No one is waiting in this queue.',
  COMPLETE_ONLY_SERVING: 'Only the token currently being served can be completed.',
  SKIP_ONLY_ACTIVE: 'Only a waiting or serving token can be skipped.',
  ALREADY_PAUSED: 'This queue is already paused.',
  NOT_PAUSED: 'This queue is not paused.',
  PAUSE_ONLY_ACTIVE: 'Only an active queue can be paused.',

  // Bookings
  CUSTOMERS_ONLY_BOOK: 'Only customers can book a slot.',
  BOOKING_DISABLED: 'This service does not take bookings. Join the queue instead.',
  SLOT_INVALID: 'Please pick one of the available slots.',
  SLOT_PAST: 'That slot has already started. Please pick a later time.',
  SLOT_FULL: 'That slot is fully booked. Please pick another time.',
  DATE_OUT_OF_RANGE: 'Please pick a date within the booking window.',
  ALREADY_BOOKED: 'You already have an upcoming booking for this service.',
  BOOKING_NOT_FOUND: 'Booking not found.',
  BOOKING_NOT_OWNER: 'You can only manage your own bookings.',
  BOOKING_NOT_ACTIVE: 'This booking is no longer active.',
  ALREADY_CHECKED_IN: 'This booking has already been checked in.',
  CHECKIN_TOO_LATE: 'The check-in time for this booking has passed. Please join the queue instead.',
  CUSTOMER_HAS_TOKEN: 'This customer already has a token in this queue.',

  // Businesses
  BUSINESS_NOT_FOUND: 'We could not find that business.',
  CHOOSE_BUSINESS: 'Please choose a business first.',

  // Public token tracking
  TOKEN_NOT_FOUND: 'We could not find that token. Check the service and token number.',
};
