const Announcement = require('../models/Announcement');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const appEmitter = require('../events/appEvents');

/**
 * POST /api/announcements (Admin / Faculty)
 * Creates a scoped announcement and broadcasts it in real time via EventEmitter -> Socket.IO.
 */
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, content, targetScope, course, section, priority, isPinned } = req.body;

  if (req.user.role === 'faculty' && targetScope === 'university') {
    throw new ApiError(403, 'Forbidden: Only administrators can publish university-wide notices.');
  }

  let resolvedCourse = course || undefined;
  let resolvedSection = section || undefined;

  if (targetScope === 'course') {
    if (!resolvedCourse) {
      throw new ApiError(400, 'Course ID is required when targetScope is "course".');
    }
    const courseDoc = await Course.findById(resolvedCourse);
    if (!courseDoc) {
      throw new ApiError(404, 'Referenced course not found.');
    }
    if (req.user.role === 'faculty') {
      const teachesCourse = await Section.exists({
        course: resolvedCourse,
        faculty: req.user._id,
      });
      if (!teachesCourse) {
        throw new ApiError(
          403,
          'Forbidden: Faculty can only publish announcements for courses assigned to them.'
        );
      }
    }
  } else if (targetScope === 'section') {
    if (!resolvedSection) {
      throw new ApiError(400, 'Section ID is required when targetScope is "section".');
    }
    const sectionDoc = await Section.findById(resolvedSection);
    if (!sectionDoc) {
      throw new ApiError(404, 'Referenced section not found.');
    }
    if (req.user.role === 'faculty' && sectionDoc.faculty.toString() !== req.user._id.toString()) {
      throw new ApiError(
        403,
        'Forbidden: Faculty can only publish announcements for sections assigned to them.'
      );
    }
    resolvedCourse = sectionDoc.course;
  } else {
    resolvedCourse = undefined;
    resolvedSection = undefined;
  }

  const announcement = await Announcement.create({
    title,
    content,
    author: req.user._id,
    targetScope,
    course: resolvedCourse,
    section: resolvedSection,
    priority: priority || 'normal',
    isPinned: Boolean(isPinned),
  });

  const populated = await announcement.populate([
    { path: 'author', select: 'name email role' },
    { path: 'course', select: 'code title' },
    { path: 'section', select: 'name academicYear' },
  ]);

  appEmitter.emit('announcement:published', { announcement: populated });

  return ApiResponse.send(res, 201, 'Announcement published successfully', populated);
});

/**
 * GET /api/announcements (Authenticated Users)
 * Retrieves announcements filtered by the user's role, enrollments, or assignments.
 */
const listAnnouncements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.targetScope) filter.targetScope = req.query.targetScope;

  if (req.user.role === 'student') {
    const enrollments = await Enrollment.find({
      student: req.user._id,
      status: 'active',
    }).select('course section');

    const enrolledCourseIds = enrollments.map((e) => e.course);
    const enrolledSectionIds = enrollments.map((e) => e.section);

    filter.$or = [
      { targetScope: 'university' },
      { targetScope: 'course', course: { $in: enrolledCourseIds } },
      { targetScope: 'section', section: { $in: enrolledSectionIds } },
    ];
  } else if (req.user.role === 'faculty') {
    const sections = await Section.find({ faculty: req.user._id }).select('_id course');
    const assignedCourseIds = sections.map((s) => s.course);
    const assignedSectionIds = sections.map((s) => s._id);

    filter.$or = [
      { targetScope: 'university' },
      { author: req.user._id },
      { targetScope: 'course', course: { $in: assignedCourseIds } },
      { targetScope: 'section', section: { $in: assignedSectionIds } },
    ];
  }

  const [announcements, total] = await Promise.all([
    Announcement.find(filter)
      .populate('author', 'name email role')
      .populate('course', 'code title')
      .populate('section', 'name academicYear')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Announcement.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    'Announcements retrieved successfully',
    announcements,
    buildPaginationMeta(total, page, limit)
  );
});

/**
 * GET /api/announcements/:id
 */
const getAnnouncementById = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('author', 'name email role')
    .populate('course', 'code title')
    .populate('section', 'name academicYear');

  if (!announcement) {
    throw new ApiError(404, 'Announcement not found');
  }

  return ApiResponse.send(res, 200, 'Announcement retrieved successfully', announcement);
});

/**
 * PATCH /api/announcements/:id (Admin or Author)
 */
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    throw new ApiError(404, 'Announcement not found');
  }

  if (
    req.user.role !== 'admin' &&
    announcement.author.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, 'Forbidden: You can only update announcements you created.');
  }

  const updatableFields = ['title', 'content', 'priority', 'isPinned'];
  for (const field of updatableFields) {
    if (req.body[field] !== undefined) {
      announcement[field] = req.body[field];
    }
  }

  await announcement.save();

  return ApiResponse.send(res, 200, 'Announcement updated successfully', announcement);
});

/**
 * DELETE /api/announcements/:id (Admin or Author)
 */
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    throw new ApiError(404, 'Announcement not found');
  }

  if (
    req.user.role !== 'admin' &&
    announcement.author.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, 'Forbidden: You can only delete announcements you created.');
  }

  await announcement.deleteOne();

  return ApiResponse.send(res, 200, 'Announcement deleted successfully', {
    deletedId: req.params.id,
  });
});

module.exports = {
  createAnnouncement,
  listAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
};
