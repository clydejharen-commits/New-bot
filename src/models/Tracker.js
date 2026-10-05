const { Schema, model } = require('mongoose');

const TrackerSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  robloxUsername: { type: String, required: true },
  robloxUserId: { type: String, required: true },
  milestone: { type: Number, required: true },
  channelId: { type: String, required: true },
  pingIds: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  milestoneReached: { type: Boolean, default: false },
  startedAt: { type: Date, default: Date.now },
  startedFollowers: { type: Number, default: 0 },
  lastFollowers: { type: Number, default: 0 },
  lastCheckAt: { type: Date, default: Date.now },
  dataPoints: [
    {
      t: { type: Date, required: true },
      f: { type: Number, required: true },
    },
  ],
});

module.exports = model('Tracker', TrackerSchema);
