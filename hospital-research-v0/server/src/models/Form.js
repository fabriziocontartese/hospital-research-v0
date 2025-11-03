const mongoose = require('mongoose');

const formSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    studyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Study' },
    kind: { type: String, enum: ['base', 'study'], required: true },
    version: { type: String, required: true },
    schema: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Form', formSchema);
