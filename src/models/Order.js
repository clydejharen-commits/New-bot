const { Schema, model } = require('mongoose');

const OrderSchema = new Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  robloxUsername: { type: String, required: true },
  robloxUserId: { type: String, required: true },
  amount: { type: Number, required: true },
  createdBy: { type: String, required: true },
  guildId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model('Order', OrderSchema);
