/**
 * Custom operational error class for standardized REST API error handling.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g., 400, 401, 403, 404, 409).
   * @param {string} message - Human-readable error message.
   * @param {Array<object|string>} [errors=[]] - Detailed validation or field errors.
   * @param {string} [stack] - Optional explicit stack trace.
   */
  constructor(statusCode, message, errors = [], stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.errors = errors;
    this.isOperational = true;
    this.success = false;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
