/**
 * Parses `page` and `limit` query parameters with safe bounds.
 * @param {object} query - Express `req.query`.
 * @param {number} [defaultLimit=10]
 * @param {number} [maxLimit=100]
 * @returns {{ page: number, limit: number, skip: number }}
 */
const parsePagination = (query = {}, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawLimit = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Builds consistent pagination metadata for API responses.
 * @param {number} totalItems
 * @param {number} page
 * @param {number} limit
 * @returns {object}
 */
const buildPaginationMeta = (totalItems, page, limit) => ({
  totalItems,
  itemCount: totalItems,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(totalItems / limit)),
  hasNextPage: page * limit < totalItems,
  hasPrevPage: page > 1,
});

module.exports = {
  parsePagination,
  buildPaginationMeta,
};
