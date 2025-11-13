const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    studyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Study', required: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    pid: { type: String, required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueAt: { type: Date },
    status: { type: String, enum: ['open', 'submitted', 'expired'], default: 'open' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// lookups
taskSchema.index({ assignee: 1, status: 1 });

// idempotency: one task per assignee × form × patient × study × org
taskSchema.index(
  { orgId: 1, studyId: 1, formId: 1, pid: 1, assignee: 1 },
  { unique: true, name: 'uniq_task_assignment' }
);

module.exports = mongoose.model('Task', taskSchema);
