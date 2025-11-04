const mongoose = require('mongoose');

const formResponseSchema = new mongoose.Schema(
  {
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true },
    studyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Study', required: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    pid: { type: String, required: true },
    answers: { type: mongoose.Schema.Types.Mixed, required: true },
    authoredAt: { type: Date, default: Date.now },
    authoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

formResponseSchema.index({ studyId: 1, pid: 1 });

module.exports = mongoose.model('FormResponse', formResponseSchema);
