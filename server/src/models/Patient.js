const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    pid: { type: String, required: true, unique: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    category: { type: String },
    cohortTags: [{ type: String }],
    strata: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);
