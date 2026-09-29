/** Turns express-validator results into a single clear 400 response. */
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array({ onlyFirstError: true }).map((e) => ({ field: e.path, message: e.msg }));
  next(new AppError(400, errors[0].message, errors));
};
