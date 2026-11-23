const express = require('express');
const { body, param } = require('express-validator');
const academicController = require('../controllers/academic.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();
router.use(authenticate);

// ======================== COURSES ========================
const courseRouter = express.Router();

courseRouter.get('/', academicController.listCourses);
courseRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid course ID'), validate],
  academicController.getCourseById
);
courseRouter.post(
  '/',
  authorize('admin'),
  [
    body('code').trim().notEmpty().withMessage('Course code is required'),
    body('title').trim().notEmpty().withMessage('Course title is required'),
    body('credits').isInt({ min: 1, max: 6 }).withMessage('Credits must be between 1 and 6'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    body('semester').isInt({ min: 1, max: 10 }).withMessage('Semester must be between 1 and 10'),
    validate,
  ],
  academicController.createCourse
);
courseRouter.patch(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid course ID'), validate],
  academicController.updateCourse
);
courseRouter.delete(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid course ID'), validate],
  academicController.deleteCourse
);

// ======================== SECTIONS ========================
const sectionRouter = express.Router();

sectionRouter.get('/', academicController.listSections);
sectionRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid section ID'), validate],
  academicController.getSectionById
);
sectionRouter.post(
  '/',
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Section name is required'),
    body('course').isMongoId().withMessage('Valid course ID is required'),
    body('faculty').isMongoId().withMessage('Valid faculty user ID is required'),
    body('semester').isInt({ min: 1, max: 10 }).withMessage('Semester must be between 1 and 10'),
    body('maxCapacity')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Max capacity must be between 1 and 500'),
    validate,
  ],
  academicController.createSection
);
sectionRouter.patch(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid section ID'), validate],
  academicController.updateSection
);
sectionRouter.delete(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid section ID'), validate],
  academicController.deleteSection
);

// ======================== ENROLLMENTS ========================
const enrollmentRouter = express.Router();

enrollmentRouter.get('/my-courses', academicController.getMyCourses);
enrollmentRouter.get('/', authorize('admin', 'faculty'), academicController.listEnrollments);
enrollmentRouter.post(
  '/',
  authorize('admin'),
  [
    body().custom((value) => {
      const student = value.student || value.studentId;
      const section = value.section || value.sectionId;
      if (!student || !section) {
        throw new Error('Both student (or studentId) and section (or sectionId) are required');
      }
      return true;
    }),
    body(['student', 'studentId']).optional().isMongoId().withMessage('Invalid student ID'),
    body(['section', 'sectionId']).optional().isMongoId().withMessage('Invalid section ID'),
    body(['course', 'courseId']).optional().isMongoId().withMessage('Invalid course ID'),
    validate,
  ],
  academicController.createEnrollment
);
enrollmentRouter.delete(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid enrollment ID'), validate],
  academicController.deleteEnrollment
);

router.use('/courses', courseRouter);
router.use('/sections', sectionRouter);
router.use('/enrollments', enrollmentRouter);

module.exports = router;
