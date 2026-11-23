const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student reference is required'],
    },
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
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'dropped', 'completed'],
        message: 'Status must be active, dropped, or completed',
      },
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate enrollment of the same student in the same course
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ section: 1, status: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
