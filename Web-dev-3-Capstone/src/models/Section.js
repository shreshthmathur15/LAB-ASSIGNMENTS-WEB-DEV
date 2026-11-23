const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Section name is required'],
      trim: true,
      maxlength: [50, 'Section name cannot exceed 50 characters'],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course reference is required'],
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned faculty reference is required'],
    },
    academicYear: {
      type: String,
      default: '2026-2027',
      trim: true,
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: [1, 'Semester must be between 1 and 10'],
      max: [10, 'Semester must be between 1 and 10'],
    },
    maxCapacity: {
      type: Number,
      default: 60,
      min: [1, 'Max capacity must be at least 1'],
      max: [500, 'Max capacity cannot exceed 500'],
    },
    schedule: {
      days: {
        type: [String],
        default: [],
      },
      timeSlot: {
        type: String,
        trim: true,
      },
      room: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate section names for the same course and academic year
sectionSchema.index({ name: 1, course: 1, academicYear: 1 }, { unique: true });
sectionSchema.index({ faculty: 1 });

module.exports = mongoose.model('Section', sectionSchema);
