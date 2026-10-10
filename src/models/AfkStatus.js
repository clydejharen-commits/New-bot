const { Schema, model } = require('mongoose');

const AfkStatusSchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  guildId: { type: String, required: true, index: true },
  reason: { type: String, default: 'No reason provided' },
  setAt: { type: Date, default: Date.now },
  mentioners: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
  }],
});

module.exports = model('AfkStatus', AfkStatusSchema);
