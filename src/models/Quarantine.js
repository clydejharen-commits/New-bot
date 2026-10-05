const { Schema, model } = require('mongoose');

const QuarantineSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  previousRoleIds: [{ type: String }],
  staffId: { type: String, required: true },
  reason: { type: String, default: 'No reason provided' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

QuarantineSchema.index({ guildId: 1, userId: 1, active: 1 });

module.exports = model('Quarantine', QuarantineSchema);
