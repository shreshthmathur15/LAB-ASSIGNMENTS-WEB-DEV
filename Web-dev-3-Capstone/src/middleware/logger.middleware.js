const morgan = require('morgan');

/**
 * Custom request timing & audit logger middleware.
 * Records HTTP method, path, response status, and execution time in milliseconds.
 */
const requestAuditLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    const actor = req.user ? `${req.user.role}:${req.user.email}` : 'anonymous';
    console.log(
      `[AUDIT] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs.toFixed(2)}ms) [actor=${actor}]`
    );
  });

  next();
};

const httpMorganLogger = morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = {
  requestAuditLogger,
  httpMorganLogger,
};
