const { Schema, model } = require('mongoose');

const refreshTokenSchema = new Schema(
  {
    tokenId: { type: String, required: true },      // tid in JWT
    tokenHash: { type: String, required: true },    // argon2 hash of refresh token
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },                      // from JWT exp
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
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
      index: true,
    },
    category: {
      type: String,
      maxlength: 120,
      trim: true,
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Persist refresh tokens (required by utils/jwt.js create/verify/revoke)
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const User = model('User', userSchema);

module.exports = User;
