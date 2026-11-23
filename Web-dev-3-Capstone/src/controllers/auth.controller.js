const crypto = require('crypto');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');

/**
 * Hashes a JWT refresh token using SHA-256 before persisting in MongoDB.
 * Demonstrates Node.js core `crypto` module and avoids storing raw tokens at rest.
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Strips sensitive fields from a User document before returning in JSON responses.
 * @param {import('mongoose').Document} user
 * @returns {object}
 */
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  rollNumber: user.rollNumber,
  employeeId: user.employeeId,
  department: user.department,
  semester: user.semester,
  phone: user.phone,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

/**
 * Issues access + refresh tokens, persists hashed refresh token, and attaches cookies.
 * @param {import('mongoose').Document} user
 * @param {import('express').Response} res
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
const issueAndPersistTokens = async (user, res) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 * Registers a student account with bcrypt password hashing and JWT token issuance.
 * Prevents role escalation during public self-registration.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, rollNumber, department, semester, phone } = req.body;

  if (role && role !== 'student') {
    throw new ApiError(
      403,
      'Self-registration is restricted to student accounts. Faculty and admin accounts must be provisioned by an administrator.'
    );
  }

  const existingEmail = await User.findOne({ email: email.toLowerCase() });
  if (existingEmail) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  if (rollNumber) {
    const existingRoll = await User.findOne({ rollNumber: rollNumber.toUpperCase() });
    if (existingRoll) {
      throw new ApiError(409, 'An account with this roll number already exists.');
    }
  }

  const user = await User.create({
    name,
    email,
    password,
    role: 'student',
    rollNumber,
    department,
    semester,
    phone,
  });

  const tokens = await issueAndPersistTokens(user, res);

  return ApiResponse.send(res, 201, 'Student registered successfully', {
    user: sanitizeUser(user),
    ...tokens,
  });
});

/**
 * POST /api/auth/login
 * Authenticates user credentials using bcrypt and returns access + refresh tokens.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password +refreshToken');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated. Please contact administration.');
  }

  const tokens = await issueAndPersistTokens(user, res);

  return ApiResponse.send(res, 200, 'Login successful', {
    user: sanitizeUser(user),
    ...tokens,
  });
});

/**
 * POST /api/auth/refresh
 * Validates an existing refresh token and rotates both access and refresh tokens.
 */
const refresh = asyncHandler(async (req, res) => {
  const incomingToken = req.body.refreshToken || (req.cookies && req.cookies.refreshToken);
  if (!incomingToken) {
    throw new ApiError(401, 'Refresh token is required.');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(incomingToken);
  } catch (_err) {
    throw new ApiError(401, 'Invalid or expired refresh token.');
  }

  const user = await User.findById(decoded.sub).select('+refreshToken');
  if (!user || !user.isActive) {
    throw new ApiError(401, 'User account not found or deactivated.');
  }

  if (!user.refreshToken || user.refreshToken !== hashToken(incomingToken)) {
    throw new ApiError(401, 'Refresh token has been revoked or rotated.');
  }

  const tokens = await issueAndPersistTokens(user, res);

  return ApiResponse.send(res, 200, 'Tokens refreshed successfully', tokens);
});

/**
 * POST /api/auth/logout
 * Invalidates the stored refresh token and clears authentication cookies.
 */
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  return ApiResponse.send(res, 200, 'Logged out successfully');
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  sanitizeUser,
};
