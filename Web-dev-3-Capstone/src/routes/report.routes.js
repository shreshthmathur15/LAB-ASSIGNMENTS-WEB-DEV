const express = require('express');
const reportController = require('../controllers/report.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authenticate, authorize('admin', 'faculty'));

router.get('/attendance-summary', reportController.getAttendanceSummary);
router.get('/attendance-summary/export', reportController.exportAttendanceSummaryCsv);
router.get('/low-attendance', reportController.getLowAttendanceReport);
router.get('/enrollment-stats', reportController.getEnrollmentStats);

module.exports = router;
