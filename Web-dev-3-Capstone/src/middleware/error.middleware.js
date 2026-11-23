const ApiError = require('../utils/ApiError');

/**
 * Middleware for handling unknown endpoints (404 Not Found).
 */
const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Centralized Express error handling middleware.
 * Normalizes operational ApiErrors, Mongoose errors, and JWT errors into uniform JSON.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = Array.isArray(err.errors) ? err.errors : [];

  // Handle Mongoose invalid ObjectId CastError
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid identifier format for field '${err.path}': '${err.value}'`;
    errors = [{ field: err.path, message }];
  }

  // Handle Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const duplicateFields = Object.keys(err.keyPattern || err.keyValue || {});
    message = `Duplicate value error for: ${duplicateFields.join(', ') || 'unique field'}`;
    errors = duplicateFields.map((field) => ({
      field,
      message: `${field} already exists`,
      value: err.keyValue ? err.keyValue[field] : undefined,
    }));
  }

  // Handle Mongoose schema validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Database schema validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Handle JWT errors if thrown directly
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
  }

  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    console.error('[Unhandled Error]', err);
  }

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
