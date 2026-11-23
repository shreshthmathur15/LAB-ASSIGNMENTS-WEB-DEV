const express = require('express');
const { body, param } = require('express-validator');
const announcementController = require('../controllers/announcement.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();
router.use(authenticate);

router.get('/', announcementController.listAnnouncements);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid announcement ID'), validate],
  announcementController.getAnnouncementById
);

router.post(
  '/',
  authorize('admin', 'faculty'),
  [
    body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 chars'),
    body('content')
      .trim()
      .isLength({ min: 5, max: 3000 })
      .withMessage('Content must be 5-3000 chars'),
    body('targetScope')
      .isIn(['university', 'course', 'section'])
      .withMessage('targetScope must be university, course, or section'),
    body('course').optional().isMongoId().withMessage('Invalid course ID'),
    body('section').optional().isMongoId().withMessage('Invalid section ID'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    validate,
  ],
  announcementController.createAnnouncement
);

router.patch(
  '/:id',
  authorize('admin', 'faculty'),
  [
    param('id').isMongoId().withMessage('Invalid announcement ID'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    validate,
  ],
  announcementController.updateAnnouncement
);

router.delete(
  '/:id',
  authorize('admin', 'faculty'),
  [param('id').isMongoId().withMessage('Invalid announcement ID'), validate],
  announcementController.deleteAnnouncement
);

module.exports = router;
