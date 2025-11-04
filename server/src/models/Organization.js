const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    country: { type: String, required: true },
    contactEmail: { type: String, required: true },
    message: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    isActive: { type: Boolean, default: true },
    admin: {
      email: { type: String },
      displayName: { type: String },
      password: { type: String }, // Added password field for admin
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);
