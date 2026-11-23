const express = require('express');
const { body, param } = require('express-validator');
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

router.use(authenticate);

// Self-service profile routes (must appear before /:id)
router.get('/me', userController.getMyProfile);
router.patch(
  '/me',
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be 2-100 characters'),
    body('phone')
      .optional()
      .matches(/^[0-9+\-\s]{7,20}$/)
      .withMessage('Invalid phone number format'),
    body('department').optional().trim().notEmpty().withMessage('Department cannot be empty'),
    validate,
  ],
  userController.updateMyProfile
);

// Administrative user management routes
router.get('/', authorize('admin'), userController.listUsers);

router.post(
  '/',
  authorize('admin'),
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role')
      .isIn(['admin', 'faculty', 'student'])
      .withMessage('Role must be admin, faculty, or student'),
    body('semester')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Semester must be between 1 and 10'),
    validate,
  ],
  userController.createUser
);

router.get(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid user ID'), validate],
  userController.getUserById
);

router.patch(
  '/:id',
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('role')
      .optional()
      .isIn(['admin', 'faculty', 'student'])
      .withMessage('Role must be admin, faculty, or student'),
    validate,
  ],
  userController.updateUser
);

router.delete(
  '/:id',
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid user ID'), validate],
  userController.deleteUser
);

module.exports = router;
