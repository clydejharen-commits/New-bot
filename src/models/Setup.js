const { Schema, model } = require('mongoose');

const SetupSchema = new Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  trackerPingIds: { type: [String], default: [] },
  quarantineStaffRoleId: { type: String, default: null },
  quarantineLogChannelId: { type: String, default: null },
  quarantineRoleId: { type: String, default: null },
  tagRoleId: { type: String, default: null },
  tagRoleEnabled: { type: Boolean, default: false },
  tagLogChannelId: { type: String, default: null },
  airdropAllowedUsers: { type: [String], default: [] },
  airdropAllowedRoles: { type: [String], default: [] },
  airdropTicketStaffUsers: { type: [String], default: [] },
  airdropTicketStaffRoles: { type: [String], default: [] },
  airdropTicketCategoryId: { type: String, default: null },
});

module.exports = model('Setup', SetupSchema);
