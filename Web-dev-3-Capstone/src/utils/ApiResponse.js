/**
 * Standardized API JSON response wrapper ensuring uniform response envelopes.
 */
class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code.
   * @param {string} message - Short status summary message.
   * @param {*} [data=null] - Payload returned to the client.
   * @param {object|null} [meta=null] - Optional pagination or summary metadata.
   */
  constructor(statusCode, message, data = null, meta = null) {
    this.success = statusCode >= 200 && statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    if (meta !== null) {
      this.meta = meta;
    }
  }

  /**
   * Helper to send standardized JSON response directly via Express `res`.
   * @param {import('express').Response} res
   * @param {number} statusCode
   * @param {string} message
   * @param {*} [data=null]
   * @param {object|null} [meta=null]
   * @returns {import('express').Response}
   */
  static send(res, statusCode, message, data = null, meta = null) {
    return res.status(statusCode).json(new ApiResponse(statusCode, message, data, meta));
  }
}

module.exports = ApiResponse;
