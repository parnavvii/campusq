/** An expected, user-facing error with an HTTP status code. */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

module.exports = AppError;
