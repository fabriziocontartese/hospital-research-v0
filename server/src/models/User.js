const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required.'],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required.'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'researcher', 'staff'],
      default: 'researcher',
    },
    category: {
      type: String,
      maxlength: 120,
      trim: true,
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = model('User', userSchema);

module.exports = User;