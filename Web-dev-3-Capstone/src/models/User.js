const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'faculty', 'student'],
        message: 'Role must be admin, faculty, or student',
      },
      default: 'student',
    },
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      set: emptyToUndefined,
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      set: emptyToUndefined,
    },
    department: {
      type: String,
      trim: true,
      default: 'Computer Science & Engineering',
    },
    semester: {
      type: Number,
      min: [1, 'Semester must be between 1 and 10'],
      max: [10, 'Semester must be between 1 and 10'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-\s]{7,20}$/, 'Invalid phone number format'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    refreshToken: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient directory & role-based filtering
userSchema.index({ role: 1, department: 1, semester: 1 });

/**
 * Hash plain-text password with bcrypt (10 salt rounds) before saving.
 */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

/**
 * Compare candidate plain-text password against stored bcrypt hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
