const { Schema, model } = require('mongoose');

const SetupSchema = new Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  trackerChannelId: { type: String, default: null },
  trackerPingId: { type: String, default: null },
});

module.exports = model('Setup', SetupSchema);
