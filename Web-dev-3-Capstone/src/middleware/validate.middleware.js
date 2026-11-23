const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Evaluates express-validator rules attached to a route and passes a 400 ApiError
 * with field-level error metadata to the centralized error handler if any rule fails.
 */
const validate = (req, _res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const formattedErrors = result.array().map((err) => ({
    field: err.path || err.param,
    message: err.msg,
    value: err.value,
  }));

  return next(new ApiError(400, 'Request validation failed', formattedErrors));
};

module.exports = validate;
