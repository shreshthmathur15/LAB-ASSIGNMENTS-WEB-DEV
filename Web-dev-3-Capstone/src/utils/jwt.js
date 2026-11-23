const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not configured.');
  }
  return secret;
};

const getRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not configured.');
  }
  return secret;
};

/**
 * Generates a short-lived JWT access token containing identity and role claims.
 * @param {object} user - User document or plain object.
 * @returns {string} Signed JWT access token.
 */
const generateAccessToken = (user) => {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });
};

/**
 * Generates a long-lived JWT refresh token for rotating expired access tokens.
 * @param {object} user - User document or plain object.
 * @returns {string} Signed JWT refresh token.
 */
const generateRefreshToken = (user) => {
  const payload = {
    sub: user._id.toString(),
    type: 'refresh',
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};

/**
 * Verifies a JWT access token and returns its decoded payload.
 * @param {string} token
 * @returns {object} Decoded JWT payload.
 */
const verifyAccessToken = (token) => jwt.verify(token, getAccessSecret());

/**
 * Verifies a JWT refresh token and returns its decoded payload.
 * @param {string} token
 * @returns {object} Decoded JWT payload.
 */
const verifyRefreshToken = (token) => jwt.verify(token, getRefreshSecret());

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
