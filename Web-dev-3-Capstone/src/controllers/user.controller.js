const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const { sanitizeUser } = require('./auth.controller');

/**
 * GET /api/users/me
 * Returns the authenticated user's own profile.
 */
const getMyProfile = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, 200, 'Profile retrieved successfully', sanitizeUser(req.user));
});

/**
 * PATCH /api/users/me
 * Updates only permitted self-service profile fields (name, phone, department).
 * Prevents self-escalation of role, rollNumber, employeeId, or isActive.
 */
const updateMyProfile = asyncHandler(async (req, res) => {
  const allowedFields = ['name', 'phone', 'department'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'No updatable profile fields provided (allowed: name, phone, department).');
  }

  const updatedUser = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  return ApiResponse.send(res, 200, 'Profile updated successfully', sanitizeUser(updatedUser));
});

/**
 * GET /api/users
 * Admin-only: Lists users with role, department, semester, search, and pagination filters.
 */
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.role) filter.role = req.query.role;
  if (req.query.department) filter.department = new RegExp(req.query.department, 'i');
  if (req.query.semester) filter.semester = Number(req.query.semester);
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    filter.$or = [{ name: regex }, { email: regex }, { rollNumber: regex }, { employeeId: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    'Users retrieved successfully',
    users.map(sanitizeUser),
    buildPaginationMeta(total, page, limit)
  );
});

/**
 * GET /api/users/:id
 * Admin-only: Retrieves a single user by ObjectId.
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return ApiResponse.send(res, 200, 'User retrieved successfully', sanitizeUser(user));
});

/**
 * POST /api/users
 * Admin-only: Provisions a student, faculty, or administrator account.
 */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, rollNumber, employeeId, department, semester, phone } =
    req.body;

  const user = await User.create({
    name,
    email,
    password,
    role,
    rollNumber,
    employeeId,
    department,
    semester,
    phone,
  });

  return ApiResponse.send(res, 201, 'User created successfully', sanitizeUser(user));
});

/**
 * PATCH /api/users/:id
 * Admin-only: Updates a user's details, role, or activation status.
 */
const updateUser = asyncHandler(async (req, res) => {
  const restrictedKeys = ['password', 'refreshToken'];
  const updates = { ...req.body };
  restrictedKeys.forEach((key) => delete updates[key]);

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return ApiResponse.send(res, 200, 'User updated successfully', sanitizeUser(user));
});

/**
 * DELETE /api/users/:id
 * Admin-only: Deletes a user record (preventing an admin from deleting themselves).
 */
const deleteUser = asyncHandler(async (req, res) => {
  if (req.user._id.toString() === req.params.id) {
    throw new ApiError(400, 'Administrators cannot delete their own active account.');
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return ApiResponse.send(res, 200, 'User deleted successfully', { deletedId: req.params.id });
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
