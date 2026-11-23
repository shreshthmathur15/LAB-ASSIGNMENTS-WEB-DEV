/**
 * Wraps asynchronous Express route handlers/controllers and forwards rejected
 * promises to the centralized Express error middleware.
 *
 * @param {Function} fn - Async Express middleware/controller (req, res, next).
 * @returns {Function} Wrapped Express middleware.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
