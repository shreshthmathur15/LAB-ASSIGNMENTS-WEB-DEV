const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Announcement title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Announcement content is required'],
      trim: true,
      minlength: [5, 'Content must be at least 5 characters'],
      maxlength: [3000, 'Content cannot exceed 3000 characters'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author reference is required'],
    },
    targetScope: {
      type: String,
      enum: {
        values: ['university', 'course', 'section'],
        message: 'Target scope must be university, course, or section',
      },
      required: [true, 'Target scope is required'],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'normal', 'high', 'urgent'],
        message: 'Priority must be low, normal, high, or urgent',
      },
      default: 'normal',
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for scoped feed queries sorted newest-first
announcementSchema.index({ targetScope: 1, course: 1, section: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
