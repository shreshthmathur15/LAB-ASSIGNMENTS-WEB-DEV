const Course = require('../models/Course');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const appEmitter = require('../events/appEvents');

// ======================== COURSES ========================

/**
 * GET /api/courses
 * Lists courses with optional department, semester, search, and pagination filters.
 */
const listCourses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.department) filter.department = new RegExp(req.query.department, 'i');
  if (req.query.semester) filter.semester = Number(req.query.semester);
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    filter.$or = [{ code: regex }, { title: regex }];
  }

  const [courses, total] = await Promise.all([
    Course.find(filter).sort({ semester: 1, code: 1 }).skip(skip).limit(limit),
    Course.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    'Courses retrieved successfully',
    courses,
    buildPaginationMeta(total, page, limit)
  );
});

/**
 * GET /api/courses/:id
 */
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new ApiError(404, 'Course not found');
  }
  return ApiResponse.send(res, 200, 'Course retrieved successfully', course);
});

/**
 * POST /api/courses (Admin)
 */
const createCourse = asyncHandler(async (req, res) => {
  const course = await Course.create(req.body);
  return ApiResponse.send(res, 201, 'Course created successfully', course);
});

/**
 * PATCH /api/courses/:id (Admin)
 */
const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!course) {
    throw new ApiError(404, 'Course not found');
  }
  return ApiResponse.send(res, 200, 'Course updated successfully', course);
});

/**
 * DELETE /api/courses/:id (Admin)
 */
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndDelete(req.params.id);
  if (!course) {
    throw new ApiError(404, 'Course not found');
  }
  return ApiResponse.send(res, 200, 'Course deleted successfully', { deletedId: req.params.id });
});

// ======================== SECTIONS ========================

/**
 * Validates that referenced course exists and referenced faculty user holds role 'faculty'.
 */
const validateSectionReferences = async (courseId, facultyId) => {
  if (courseId) {
    const courseExists = await Course.exists({ _id: courseId });
    if (!courseExists) {
      throw new ApiError(404, 'Referenced course not found');
    }
  }

  if (facultyId) {
    const facultyUser = await User.findById(facultyId);
    if (!facultyUser) {
      throw new ApiError(404, 'Referenced faculty member not found');
    }
    if (facultyUser.role !== 'faculty') {
      throw new ApiError(400, 'Assigned user must have the faculty role');
    }
  }
};

/**
 * GET /api/sections
 */
const listSections = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.course) filter.course = req.query.course;
  if (req.query.faculty) filter.faculty = req.query.faculty;
  if (req.query.semester) filter.semester = Number(req.query.semester);
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;

  const [sections, total] = await Promise.all([
    Section.find(filter)
      .populate('course', 'code title credits department semester')
      .populate('faculty', 'name email employeeId department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Section.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    'Sections retrieved successfully',
    sections,
    buildPaginationMeta(total, page, limit)
  );
});

/**
 * GET /api/sections/:id
 */
const getSectionById = asyncHandler(async (req, res) => {
  const section = await Section.findById(req.params.id)
    .populate('course', 'code title credits department semester')
    .populate('faculty', 'name email employeeId department');

  if (!section) {
    throw new ApiError(404, 'Section not found');
  }
  return ApiResponse.send(res, 200, 'Section retrieved successfully', section);
});

/**
 * POST /api/sections (Admin)
 */
const createSection = asyncHandler(async (req, res) => {
  const { name, course, faculty, academicYear, semester, maxCapacity, schedule } = req.body;
  await validateSectionReferences(course, faculty);

  const section = await Section.create({
    name,
    course,
    faculty,
    academicYear,
    semester,
    maxCapacity,
    schedule,
  });

  const populated = await section.populate([
    { path: 'course', select: 'code title credits department semester' },
    { path: 'faculty', select: 'name email employeeId department' },
  ]);

  return ApiResponse.send(res, 201, 'Section created and faculty assigned successfully', populated);
});

/**
 * PATCH /api/sections/:id (Admin)
 */
const updateSection = asyncHandler(async (req, res) => {
  await validateSectionReferences(req.body.course, req.body.faculty);

  const section = await Section.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate('course', 'code title credits department semester')
    .populate('faculty', 'name email employeeId department');

  if (!section) {
    throw new ApiError(404, 'Section not found');
  }

  return ApiResponse.send(res, 200, 'Section updated successfully', section);
});

/**
 * DELETE /api/sections/:id (Admin)
 */
const deleteSection = asyncHandler(async (req, res) => {
  const section = await Section.findByIdAndDelete(req.params.id);
  if (!section) {
    throw new ApiError(404, 'Section not found');
  }
  return ApiResponse.send(res, 200, 'Section deleted successfully', { deletedId: req.params.id });
});

// ======================== ENROLLMENTS ========================

/**
 * POST /api/enrollments (Admin)
 * Enrolls a student into a course section while verifying references, section capacity,
 * and preventing duplicate course enrollments.
 */
const createEnrollment = asyncHandler(async (req, res) => {
  const studentId = req.body.student || req.body.studentId;
  const sectionId = req.body.section || req.body.sectionId;
  const courseId = req.body.course || req.body.courseId;

  const [student, section] = await Promise.all([
    User.findById(studentId),
    Section.findById(sectionId).populate('course'),
  ]);

  if (!student) {
    throw new ApiError(404, 'Student not found');
  }
  if (student.role !== 'student') {
    throw new ApiError(400, 'Only users with the student role can be enrolled in courses');
  }
  if (!section || !section.course) {
    throw new ApiError(404, 'Section or associated course not found');
  }

  if (courseId && courseId.toString() !== section.course._id.toString()) {
    throw new ApiError(400, 'Specified course does not match the selected section');
  }

  const existingEnrollment = await Enrollment.findOne({
    student: student._id,
    course: section.course._id,
  });
  if (existingEnrollment) {
    throw new ApiError(409, 'Student is already enrolled in this course');
  }

  const activeCount = await Enrollment.countDocuments({
    section: section._id,
    status: 'active',
  });
  if (activeCount >= section.maxCapacity) {
    throw new ApiError(400, `Section '${section.name}' has reached maximum capacity`);
  }

  const enrollment = await Enrollment.create({
    student: student._id,
    course: section.course._id,
    section: section._id,
  });

  appEmitter.emit('enrollment:created', {
    enrollment,
    student,
    course: section.course,
    section,
  });

  const populated = await enrollment.populate([
    { path: 'student', select: 'name email rollNumber semester' },
    { path: 'course', select: 'code title credits semester' },
    { path: 'section', select: 'name academicYear schedule' },
  ]);

  return ApiResponse.send(res, 201, 'Student enrolled successfully', populated);
});

/**
 * GET /api/enrollments/my-courses
 * Returns enrolled courses for students, or assigned sections for faculty.
 */
const getMyCourses = asyncHandler(async (req, res) => {
  if (req.user.role === 'student') {
    const enrollments = await Enrollment.find({ student: req.user._id, status: 'active' })
      .populate('course', 'code title description credits department semester')
      .populate({
        path: 'section',
        select: 'name academicYear schedule faculty',
        populate: { path: 'faculty', select: 'name email employeeId' },
      })
      .sort({ createdAt: -1 });

    return ApiResponse.send(res, 200, 'Enrolled courses retrieved successfully', enrollments);
  }

  if (req.user.role === 'faculty') {
    const sections = await Section.find({ faculty: req.user._id })
      .populate('course', 'code title description credits department semester')
      .sort({ semester: 1, name: 1 });

    return ApiResponse.send(res, 200, 'Assigned sections retrieved successfully', sections);
  }

  const allSections = await Section.find()
    .populate('course', 'code title credits department semester')
    .populate('faculty', 'name email employeeId')
    .sort({ createdAt: -1 });

  return ApiResponse.send(res, 200, 'All academic sections retrieved successfully', allSections);
});

/**
 * GET /api/enrollments (Admin/Faculty)
 */
const listEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.section) filter.section = req.query.section;
  if (req.query.course) filter.course = req.query.course;
  if (req.query.student) filter.student = req.query.student;
  if (req.query.status) filter.status = req.query.status;

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('student', 'name email rollNumber semester department')
      .populate('course', 'code title credits semester')
      .populate('section', 'name academicYear')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Enrollment.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    'Enrollments retrieved successfully',
    enrollments,
    buildPaginationMeta(total, page, limit)
  );
});

/**
 * DELETE /api/enrollments/:id (Admin)
 */
const deleteEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findByIdAndDelete(req.params.id);
  if (!enrollment) {
    throw new ApiError(404, 'Enrollment record not found');
  }
  return ApiResponse.send(res, 200, 'Enrollment removed successfully', {
    deletedId: req.params.id,
  });
});

module.exports = {
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  listSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  createEnrollment,
  getMyCourses,
  listEnrollments,
  deleteEnrollment,
};
