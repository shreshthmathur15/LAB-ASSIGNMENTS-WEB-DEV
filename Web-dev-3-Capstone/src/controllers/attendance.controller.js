const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const appEmitter = require('../events/appEvents');

/**
 * Computes subject-wise attendance summary for a student using MongoDB aggregation.
 * @param {string|mongoose.Types.ObjectId} studentId
 * @param {string} [courseId]
 * @returns {Promise<Array<object>>}
 */
const buildStudentAttendanceSummary = async (studentId, courseId = null) => {
  const matchStage = { student: new mongoose.Types.ObjectId(studentId) };
  if (courseId) {
    matchStage.course = new mongoose.Types.ObjectId(courseId);
  }

  return Attendance.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$course',
        totalClasses: { $sum: 1 },
        attendedClasses: {
          $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] },
        },
        absentClasses: {
          $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] },
        },
        excusedClasses: {
          $sum: { $cond: [{ $eq: ['$status', 'Excused'] }, 1, 0] },
        },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'courseDetails',
      },
    },
    { $unwind: '$courseDetails' },
    {
      $addFields: {
        attendancePercentage: {
          $cond: [
            { $gt: ['$totalClasses', 0] },
            {
              $round: [{ $multiply: [{ $divide: ['$attendedClasses', '$totalClasses'] }, 100] }, 2],
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        courseId: '$_id',
        courseCode: '$courseDetails.code',
        courseTitle: '$courseDetails.title',
        totalClasses: 1,
        attendedClasses: 1,
        absentClasses: 1,
        excusedClasses: 1,
        attendancePercentage: 1,
      },
    },
    { $sort: { courseCode: 1 } },
  ]);
};

/**
 * POST /api/attendance/mark (Faculty / Admin)
 * Marks single or bulk attendance for a section and date session.
 * Enforces faculty assignment ownership, active enrollment verification, and duplicate protection.
 */
const markAttendance = asyncHandler(async (req, res) => {
  const { sectionId, courseId, date, sessionNumber = 1, records, studentId, status, remarks } =
    req.body;

  const section = await Section.findById(sectionId).populate('course');
  if (!section || !section.course) {
    throw new ApiError(404, 'Section or associated course not found');
  }

  if (courseId && courseId.toString() !== section.course._id.toString()) {
    throw new ApiError(400, 'Course ID does not match the specified section');
  }

  // Business Rule: Faculty may only mark attendance for sections assigned to them
  if (req.user.role === 'faculty' && section.faculty.toString() !== req.user._id.toString()) {
    throw new ApiError(
      403,
      'Forbidden: You are not assigned to mark attendance for this section.'
    );
  }

  // Normalize single-student or bulk payload into a unified records list
  const attendanceInput = Array.isArray(records)
    ? records
    : [{ studentId, status, remarks }];

  const studentIds = attendanceInput.map((item) => item.studentId);
  const uniqueStudentIds = [...new Set(studentIds.map((id) => id.toString()))];
  if (uniqueStudentIds.length !== studentIds.length) {
    throw new ApiError(400, 'Duplicate student entries found in the same attendance request');
  }

  // Verify all target students are actively enrolled in this section
  const activeEnrollments = await Enrollment.find({
    section: section._id,
    student: { $in: uniqueStudentIds },
    status: 'active',
  }).select('student');

  const enrolledSet = new Set(activeEnrollments.map((e) => e.student.toString()));
  const unenrolledIds = uniqueStudentIds.filter((id) => !enrolledSet.has(id));
  if (unenrolledIds.length > 0) {
    throw new ApiError(
      400,
      `Students are not actively enrolled in section '${section.name}': ${unenrolledIds.join(', ')}`
    );
  }

  const normalizedDate = Attendance.normalizeDate(date);
  if (Number.isNaN(normalizedDate.getTime())) {
    throw new ApiError(400, 'Invalid attendance date');
  }

  // Prevent duplicate attendance for the same student, course, section, date, and session
  const existing = await Attendance.find({
    course: section.course._id,
    section: section._id,
    date: normalizedDate,
    sessionNumber,
    student: { $in: uniqueStudentIds },
  }).select('student');

  if (existing.length > 0) {
    throw new ApiError(
      409,
      'Attendance has already been recorded for one or more students in this class session.'
    );
  }

  const docsToInsert = attendanceInput.map((item) => ({
    course: section.course._id,
    section: section._id,
    student: item.studentId,
    markedBy: req.user._id,
    date: normalizedDate,
    sessionNumber,
    status: item.status,
    remarks: item.remarks,
  }));

  const createdRecords = await Attendance.insertMany(docsToInsert);

  appEmitter.emit('attendance:marked', {
    records: createdRecords,
    course: section.course,
    section,
    date: normalizedDate,
    markedBy: req.user._id,
  });

  return ApiResponse.send(
    res,
    201,
    `Attendance marked successfully for ${createdRecords.length} student(s)`,
    createdRecords
  );
});

/**
 * PATCH /api/attendance/:id (Faculty / Admin)
 * Corrects an existing attendance record while recording an immutable auditLog entry.
 */
const correctAttendance = asyncHandler(async (req, res) => {
  const { status, reason, remarks } = req.body;

  const record = await Attendance.findById(req.params.id);
  if (!record) {
    throw new ApiError(404, 'Attendance record not found');
  }

  const section = await Section.findById(record.section);
  if (!section) {
    throw new ApiError(404, 'Associated section not found');
  }

  if (req.user.role === 'faculty' && section.faculty.toString() !== req.user._id.toString()) {
    throw new ApiError(
      403,
      'Forbidden: You cannot modify attendance for a section not assigned to you.'
    );
  }

  if (record.status === status) {
    throw new ApiError(400, `Attendance status is already '${status}'.`);
  }

  const previousStatus = record.status;
  record.auditLog.push({
    previousStatus,
    newStatus: status,
    changedBy: req.user._id,
    reason,
    changedAt: new Date(),
  });
  record.status = status;
  if (remarks !== undefined) {
    record.remarks = remarks;
  }

  await record.save();

  appEmitter.emit('attendance:corrected', {
    record,
    previousStatus,
    newStatus: status,
    reason,
    changedBy: req.user._id,
  });

  return ApiResponse.send(res, 200, 'Attendance corrected with audit log recorded', record);
});

/**
 * Shared helper for fetching student attendance records and summary.
 */
const fetchStudentAttendanceData = async (studentId, query) => {
  const { page, limit, skip } = parsePagination(query, 20);
  const filter = { student: studentId };

  if (query.course) {
    filter.course = query.course;
  }
  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) filter.date.$gte = Attendance.normalizeDate(query.startDate);
    if (query.endDate) filter.date.$lte = Attendance.normalizeDate(query.endDate);
  }

  const [records, total, summary] = await Promise.all([
    Attendance.find(filter)
      .populate('course', 'code title credits')
      .populate('section', 'name academicYear')
      .populate('markedBy', 'name email')
      .sort({ date: -1, sessionNumber: -1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter),
    buildStudentAttendanceSummary(studentId, query.course || null),
  ]);

  return {
    summary,
    records,
    meta: buildPaginationMeta(total, page, limit),
  };
};

/**
 * GET /api/attendance/my (Student)
 * Returns the authenticated student's own attendance records and subject-wise summary.
 */
const getMyAttendance = asyncHandler(async (req, res) => {
  const result = await fetchStudentAttendanceData(req.user._id, req.query);
  return ApiResponse.send(
    res,
    200,
    'Personal attendance retrieved successfully',
    { summary: result.summary, records: result.records },
    result.meta
  );
});

/**
 * GET /api/attendance/student/:studentId (Student self, Faculty, Admin)
 * Business Rule: Students cannot view another student's private attendance record.
 */
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
    throw new ApiError(
      403,
      "Forbidden: Students cannot view another student's private attendance record."
    );
  }

  const student = await User.findById(studentId).select('name email rollNumber semester department');
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  const result = await fetchStudentAttendanceData(studentId, req.query);
  return ApiResponse.send(
    res,
    200,
    'Student attendance retrieved successfully',
    { student, summary: result.summary, records: result.records },
    result.meta
  );
});

/**
 * GET /api/attendance/section/:sectionId (Faculty / Admin)
 * Retrieves attendance records for a given section, optionally filtered by date or session.
 */
const getSectionAttendance = asyncHandler(async (req, res) => {
  const section = await Section.findById(req.params.sectionId).populate('course', 'code title');
  if (!section) {
    throw new ApiError(404, 'Section not found');
  }

  if (req.user.role === 'faculty' && section.faculty.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Forbidden: You are not assigned to this section.');
  }

  const { page, limit, skip } = parsePagination(req.query, 25);
  const filter = { section: section._id };

  if (req.query.date) filter.date = Attendance.normalizeDate(req.query.date);
  if (req.query.sessionNumber) filter.sessionNumber = Number(req.query.sessionNumber);
  if (req.query.status) filter.status = req.query.status;

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .populate('student', 'name email rollNumber')
      .populate('markedBy', 'name')
      .sort({ date: -1, sessionNumber: 1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    'Section attendance retrieved successfully',
    { section, records },
    buildPaginationMeta(total, page, limit)
  );
});

module.exports = {
  markAttendance,
  correctAttendance,
  getMyAttendance,
  getStudentAttendance,
  getSectionAttendance,
};
