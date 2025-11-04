const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    when: { type: String },
    toRole: { type: String, enum: ['admin', 'researcher', 'staff'] },
  },
  { _id: false }
);

const studySchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    status: { type: String, enum: ['draft', 'active', 'paused', 'closed'], default: 'draft' },
    baseFormId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
    allowedVariables: [{ type: String }],
    assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignedPatients: [{ type: String }],
    notifications: [notificationSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Study', studySchema);
