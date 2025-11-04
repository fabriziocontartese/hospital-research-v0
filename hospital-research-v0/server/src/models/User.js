const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'admin', 'researcher', 'staff'], required: true },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      validate: {
        validator(value) {
          if (this.role === 'superadmin') {
            return value === undefined || value === null;
          }
          return value != null;
        },
        message: 'Organization is required for non-superadmin users',
      },
    },
    isActive: { type: Boolean, default: true },
    displayName: { type: String },
    category: { type: String },
    refreshTokens: [refreshTokenSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
