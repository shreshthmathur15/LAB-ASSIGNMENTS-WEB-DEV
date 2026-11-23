const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/jwt');

/**
 * Extracts and verifies the JWT access token from the Authorization header
 * or cookies, then attaches the active user document to `req.user`.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new ApiError(401, 'Authentication required. Please provide a valid Bearer token.');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Access token has expired. Please refresh your token.'
        : 'Invalid authentication token.';
    throw new ApiError(401, message);
  }

  const user = await User.findById(decoded.sub);
  if (!user || !user.isActive) {
    throw new ApiError(401, 'User account not found or deactivated.');
  }

  req.user = user;
  next();
});

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Allows access only if `req.user.role` is included in `allowedRoles`.
 *
 * @param {...string} allowedRoles - Permitted roles (e.g., 'admin', 'faculty', 'student').
 * @returns {Function} Express middleware.
 */
const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required before role authorization.'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(
      new ApiError(
        403,
        `Access forbidden: Role '${req.user.role}' is not authorized to perform this action.`
      )
    );
  }

  return next();
};

module.exports = {
  authenticate,
  authorize,
};
