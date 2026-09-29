const env = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body must be valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large.' });
  }
  if (err.expose && err.status) {
    const body = { success: false, message: err.message };
    if (err.details) body.errors = err.details;
    return res.status(err.status).json(body);
  }
  // Unexpected error: log details server-side, never leak internals to clients.
  console.error('[error]', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong on the server. Please try again.',
    ...(env.isProduction ? {} : { debug: err.message }),
  });
}

module.exports = { notFound, errorHandler };
