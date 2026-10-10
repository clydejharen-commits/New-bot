const { Schema, model } = require('mongoose');

const AirdropSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  creatorId: { type: String, required: true },
  prize: { type: String, required: true },
  maxClaims: { type: Number, required: true },
  claimCount: { type: Number, default: 0 },
  claimantIds: [{ type: String }],
  messageId: { type: String, required: true },
  channelId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'full', 'closed'], default: 'active' },
  ticketChannelIds: [{ type: String }],
});

module.exports = model('Airdrop', AirdropSchema);
