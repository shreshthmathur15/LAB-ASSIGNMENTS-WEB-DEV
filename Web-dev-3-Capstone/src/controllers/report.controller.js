const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Section = require('../models/Section');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Builds the reusable attendance aggregation pipeline for summary and CSV export.
 * @param {object} query
 * @returns {Promise<Array<object>>}
 */
const runAttendanceSummaryPipeline = async (query = {}) => {
  const matchStage = {};

  if (query.courseId && mongoose.isValidObjectId(query.courseId)) {
    matchStage.course = new mongoose.Types.ObjectId(query.courseId);
  }
  if (query.sectionId && mongoose.isValidObjectId(query.sectionId)) {
    matchStage.section = new mongoose.Types.ObjectId(query.sectionId);
  }
  if (query.studentId && mongoose.isValidObjectId(query.studentId)) {
    matchStage.student = new mongoose.Types.ObjectId(query.studentId);
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          student: '$student',
          course: '$course',
          section: '$section',
        },
        totalClasses: { $sum: 1 },
        presentCount: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
        lateCount: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
        absentCount: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
        excusedCount: { $sum: { $cond: [{ $eq: ['$status', 'Excused'] }, 1, 0] } },
        attendedClasses: {
          $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.student',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: '$student' },
    {
      $lookup: {
        from: 'courses',
        localField: '_id.course',
        foreignField: '_id',
        as: 'course',
      },
    },
    { $unwind: '$course' },
    {
      $lookup: {
        from: 'sections',
        localField: '_id.section',
        foreignField: '_id',
        as: 'section',
      },
    },
    { $unwind: '$section' },
  ];

  if (query.semester) {
    pipeline.push({
      $match: { 'course.semester': Number(query.semester) },
    });
  }

  pipeline.push(
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
        studentId: '$student._id',
        studentName: '$student.name',
        rollNumber: '$student.rollNumber',
        studentEmail: '$student.email',
        courseId: '$course._id',
        courseCode: '$course.code',
        courseTitle: '$course.title',
        semester: '$course.semester',
        sectionId: '$section._id',
        sectionName: '$section.name',
        totalClasses: 1,
        attendedClasses: 1,
        presentCount: 1,
        lateCount: 1,
        absentCount: 1,
        excusedCount: 1,
        attendancePercentage: 1,
      },
    },
    { $sort: { courseCode: 1, rollNumber: 1 } }
  );

  return Attendance.aggregate(pipeline);
};

/**
 * GET /api/reports/attendance-summary (Admin / Faculty)
 * Aggregation Pipeline 1: Subject-wise and student-wise attendance statistics.
 */
const getAttendanceSummary = asyncHandler(async (req, res) => {
  const results = await runAttendanceSummaryPipeline(req.query);
  return ApiResponse.send(res, 200, 'Attendance summary report generated', results, {
    count: results.length,
  });
});

/**
 * GET /api/reports/low-attendance (Admin / Faculty)
 * Aggregation Pipeline 2: Identifies students falling below configurable attendance threshold.
 */
const getLowAttendanceReport = asyncHandler(async (req, res) => {
  const defaultThreshold = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);
  const threshold = req.query.threshold !== undefined ? Number(req.query.threshold) : defaultThreshold;

  if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
    throw new ApiError(400, 'Threshold must be a valid percentage between 0 and 100');
  }

  const matchStage = {};
  if (req.query.courseId && mongoose.isValidObjectId(req.query.courseId)) {
    matchStage.course = new mongoose.Types.ObjectId(req.query.courseId);
  }
  if (req.query.sectionId && mongoose.isValidObjectId(req.query.sectionId)) {
    matchStage.section = new mongoose.Types.ObjectId(req.query.sectionId);
  }

  const defaulters = await Attendance.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          student: '$student',
          course: '$course',
          section: '$section',
        },
        totalClasses: { $sum: 1 },
        attendedClasses: {
          $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] },
        },
      },
    },
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
      $match: {
        attendancePercentage: { $lt: threshold },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.student',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: '$student' },
    {
      $lookup: {
        from: 'courses',
        localField: '_id.course',
        foreignField: '_id',
        as: 'course',
      },
    },
    { $unwind: '$course' },
    {
      $lookup: {
        from: 'sections',
        localField: '_id.section',
        foreignField: '_id',
        as: 'section',
      },
    },
    { $unwind: '$section' },
    {
      $project: {
        _id: 0,
        studentId: '$student._id',
        studentName: '$student.name',
        rollNumber: '$student.rollNumber',
        email: '$student.email',
        courseCode: '$course.code',
        courseTitle: '$course.title',
        sectionName: '$section.name',
        totalClasses: 1,
        attendedClasses: 1,
        attendancePercentage: 1,
        threshold: { $literal: threshold },
        deficitPercentage: {
          $round: [{ $subtract: [threshold, '$attendancePercentage'] }, 2],
        },
      },
    },
    { $sort: { attendancePercentage: 1, rollNumber: 1 } },
  ]);

  return ApiResponse.send(res, 200, 'Low-attendance defaulters report generated', defaulters, {
    threshold,
    defaulterCount: defaulters.length,
  });
});

/**
 * GET /api/reports/enrollment-stats (Admin / Faculty)
 * Aggregation Pipeline 3: Multi-facet course enrollment counts, section utilization,
 * and department-wise seat distribution.
 */
const getEnrollmentStats = asyncHandler(async (_req, res) => {
  const [stats] = await Section.aggregate([
    {
      $lookup: {
        from: 'enrollments',
        let: { sectionId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$section', '$$sectionId'] },
                  { $eq: ['$status', 'active'] },
                ],
              },
            },
          },
        ],
        as: 'activeEnrollments',
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: 'course',
        foreignField: '_id',
        as: 'courseInfo',
      },
    },
    { $unwind: '$courseInfo' },
    {
      $lookup: {
        from: 'users',
        localField: 'faculty',
        foreignField: '_id',
        as: 'facultyInfo',
      },
    },
    { $unwind: '$facultyInfo' },
    {
      $addFields: {
        enrolledCount: { $size: '$activeEnrollments' },
        utilizationPercentage: {
          $cond: [
            { $gt: ['$maxCapacity', 0] },
            {
              $round: [
                {
                  $multiply: [{ $divide: [{ $size: '$activeEnrollments' }, '$maxCapacity'] }, 100],
                },
                2,
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $facet: {
        sectionWise: [
          {
            $project: {
              _id: 0,
              sectionId: '$_id',
              sectionName: '$name',
              academicYear: 1,
              courseCode: '$courseInfo.code',
              courseTitle: '$courseInfo.title',
              department: '$courseInfo.department',
              semester: '$courseInfo.semester',
              facultyName: '$facultyInfo.name',
              enrolledCount: 1,
              maxCapacity: 1,
              utilizationPercentage: 1,
            },
          },
          { $sort: { courseCode: 1, sectionName: 1 } },
        ],
        courseWise: [
          {
            $group: {
              _id: '$courseInfo._id',
              courseCode: { $first: '$courseInfo.code' },
              courseTitle: { $first: '$courseInfo.title' },
              department: { $first: '$courseInfo.department' },
              semester: { $first: '$courseInfo.semester' },
              totalSections: { $sum: 1 },
              totalEnrolled: { $sum: '$enrolledCount' },
              totalCapacity: { $sum: '$maxCapacity' },
            },
          },
          {
            $project: {
              _id: 0,
              courseId: '$_id',
              courseCode: 1,
              courseTitle: 1,
              department: 1,
              semester: 1,
              totalSections: 1,
              totalEnrolled: 1,
              totalCapacity: 1,
            },
          },
          { $sort: { courseCode: 1 } },
        ],
        departmentSummary: [
          {
            $group: {
              _id: '$courseInfo.department',
              totalSections: { $sum: 1 },
              totalEnrolledSeats: { $sum: '$enrolledCount' },
              totalCapacity: { $sum: '$maxCapacity' },
            },
          },
          {
            $project: {
              _id: 0,
              department: '$_id',
              totalSections: 1,
              totalEnrolledSeats: 1,
              totalCapacity: 1,
            },
          },
          { $sort: { department: 1 } },
        ],
      },
    },
  ]);

  return ApiResponse.send(
    res,
    200,
    'Course and section enrollment statistics generated',
    stats || { sectionWise: [], courseWise: [], departmentSummary: [] }
  );
});

/**
 * GET /api/reports/attendance-summary/export (Admin / Faculty)
 * Generates a downloadable CSV report of student attendance summaries.
 */
const exportAttendanceSummaryCsv = asyncHandler(async (req, res) => {
  const rows = await runAttendanceSummaryPipeline(req.query);

  const headers = [
    'Roll Number',
    'Student Name',
    'Email',
    'Course Code',
    'Course Title',
    'Semester',
    'Section',
    'Total Classes',
    'Attended Classes',
    'Present',
    'Late',
    'Absent',
    'Excused',
    'Attendance %',
  ];

  const escapeCsv = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(
      [
        row.rollNumber || '',
        row.studentName,
        row.studentEmail,
        row.courseCode,
        row.courseTitle,
        row.semester,
        row.sectionName,
        row.totalClasses,
        row.attendedClasses,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        row.attendancePercentage,
      ]
        .map(escapeCsv)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="krmu_attendance_report.csv"');
  return res.status(200).send(csvLines.join('\n'));
});

module.exports = {
  getAttendanceSummary,
  getLowAttendanceReport,
  getEnrollmentStats,
  exportAttendanceSummaryCsv,
};
