const express = require('express');
const { body, param } = require('express-validator');
const attendanceController = require('../controllers/attendance.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();
router.use(authenticate);

const validStatuses = ['Present', 'Absent', 'Late', 'Excused'];

router.post(
  '/mark',
  authorize('faculty', 'admin'),
  [
    body('sectionId').isMongoId().withMessage('Valid sectionId is required'),
    body('courseId').optional().isMongoId().withMessage('Invalid courseId'),
    body('date').isISO8601().withMessage('Valid ISO 8601 date (YYYY-MM-DD) is required'),
    body('sessionNumber')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('sessionNumber must be between 1 and 10'),
    body().custom((value) => {
      if (Array.isArray(value.records)) {
        if (value.records.length === 0) {
          throw new Error('records array must contain at least one student entry');
        }
        return true;
      }
      if (!value.studentId || !value.status) {
        throw new Error('Provide either a records array or studentId and status');
      }
      return true;
    }),
    body('records.*.studentId').optional().isMongoId().withMessage('Invalid studentId in records'),
    body('records.*.status')
      .optional()
      .isIn(validStatuses)
      .withMessage(`Status must be one of: ${validStatuses.join(', ')}`),
    body('studentId').optional().isMongoId().withMessage('Invalid studentId'),
    body('status')
      .optional()
      .isIn(validStatuses)
      .withMessage(`Status must be one of: ${validStatuses.join(', ')}`),
    validate,
  ],
  attendanceController.markAttendance
);

router.get('/my', authorize('student'), attendanceController.getMyAttendance);

router.get(
  '/student/:studentId',
  authorize('student', 'faculty', 'admin'),
  [param('studentId').isMongoId().withMessage('Invalid student ID'), validate],
  attendanceController.getStudentAttendance
);

router.get(
  '/section/:sectionId',
  authorize('faculty', 'admin'),
  [param('sectionId').isMongoId().withMessage('Invalid section ID'), validate],
  attendanceController.getSectionAttendance
);

router.patch(
  '/:id',
  authorize('faculty', 'admin'),
  [
    param('id').isMongoId().withMessage('Invalid attendance record ID'),
    body('status')
      .isIn(validStatuses)
      .withMessage(`Status must be one of: ${validStatuses.join(', ')}`),
    body('reason')
      .trim()
      .isLength({ min: 3, max: 300 })
      .withMessage('Audit reason (3-300 chars) is required when correcting attendance'),
    validate,
  ],
  attendanceController.correctAttendance
);

module.exports = router;
