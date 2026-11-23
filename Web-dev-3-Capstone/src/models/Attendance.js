const mongoose = require('mongoose');

const auditEntrySchema = new mongoose.Schema(
  {
    previousStatus: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused'],
      required: true,
    },
    newStatus: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused'],
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Correction reason is required for audit trail'],
      trim: true,
      maxlength: [300, 'Reason cannot exceed 300 characters'],
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/**
 * Normalizes a Date or date string to UTC midnight (YYYY-MM-DDT00:00:00.000Z)
 * so unique session checks work consistently regardless of time-of-day.
 * @param {Date|string} value
 * @returns {Date}
 */
const normalizeDateToUTCMidnight = (value) => {
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) {
    return value;
  }
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
};

const attendanceSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course reference is required'],
    },
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: [true, 'Section reference is required'],
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student reference is required'],
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Faculty/Admin marker reference is required'],
    },
    date: {
      type: Date,
      required: [true, 'Attendance date is required'],
      set: normalizeDateToUTCMidnight,
    },
    sessionNumber: {
      type: Number,
      default: 1,
      min: [1, 'Session number must be at least 1'],
      max: [10, 'Session number cannot exceed 10'],
    },
    status: {
      type: String,
      enum: {
        values: ['Present', 'Absent', 'Late', 'Excused'],
        message: 'Status must be Present, Absent, Late, or Excused',
      },
      required: [true, 'Attendance status is required'],
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [250, 'Remarks cannot exceed 250 characters'],
    },
    auditLog: {
      type: [auditEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate attendance records for the same student, course, section, date, and class session
attendanceSchema.index(
  { student: 1, course: 1, section: 1, date: 1, sessionNumber: 1 },
  { unique: true }
);
attendanceSchema.index({ course: 1, section: 1, date: -1 });

attendanceSchema.statics.normalizeDate = normalizeDateToUTCMidnight;

module.exports = mongoose.model('Attendance', attendanceSchema);
