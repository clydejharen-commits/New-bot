const { Schema, model } = require('mongoose');

const AppealSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  quarantineId: { type: Schema.Types.ObjectId, required: true },
  quarantineReason: { type: String, default: 'No reason provided' },
  appealReason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  staffId: { type: String, default: null },
  denyReason: { type: String, default: null },
  appealMessageId: { type: String, default: null },
  appealChannelId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  decidedAt: { type: Date, default: null },
});

AppealSchema.index({ guildId: 1, userId: 1, status: 1 });

module.exports = model('Appeal', AppealSchema);
