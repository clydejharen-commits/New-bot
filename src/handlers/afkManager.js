const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const AfkStatus = require('../models/AfkStatus');
const logger = require('../utils/logger');

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && days === 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(' ') : '0s';
}

async function setAfkStatus(userId, guildId, reason) {
  const finalReason = reason && reason.trim().length > 0 ? reason.trim() : 'No reason provided';

  await AfkStatus.findOneAndUpdate(
    { userId, guildId },
    { userId, guildId, reason: finalReason, setAt: new Date(), mentioners: [] },
    { upsert: true },
  );

  return { reason: finalReason };
}

async function getAfkStatuses(userIds, guildId) {
  if (!userIds || userIds.length === 0) return [];
  return AfkStatus.find({ userId: { $in: userIds }, guildId }).lean();
}

async function clearAfkStatus(userId, guildId) {
  return AfkStatus.findOneAndDelete({ userId, guildId });
}

async function addMentioner(afkUserId, guildId, mentionerUserId, mentionerUsername) {
  await AfkStatus.updateOne(
    { userId: afkUserId, guildId },
    { $addToSet: { mentioners: { userId: mentionerUserId, username: mentionerUsername } } },
  );
}

async function buildWelcomeBackEmbed(afkDoc) {
  const durationMs = Date.now() - new Date(afkDoc.setAt).getTime();
  const durationStr = formatDuration(durationMs);

  const mentioners = afkDoc.mentioners || [];
  const uniqueNames = [];
  const seen = new Set();
  for (const m of mentioners) {
    if (!seen.has(m.userId)) {
      seen.add(m.userId);
      uniqueNames.push(m.username);
    }
  }

  const mentionList = uniqueNames.length > 0
    ? uniqueNames.map((name) => `• ${name}`).join('\n')
    : 'Nobody mentioned you while you were AFK.';

  const embed = new EmbedBuilder()
    .setTitle('👋 Welcome back!')
    .setColor(0x2b2d31)
    .setDescription('Your AFK status has been removed.')
    .addFields(
      { name: 'While you were AFK, these members mentioned you', value: mentionList, inline: false },
      { name: 'Total AFK Duration', value: durationStr, inline: false },
    )
    .setTimestamp();

  return embed;
}

module.exports = {
  setAfkStatus,
  getAfkStatuses,
  clearAfkStatus,
  addMentioner,
  buildWelcomeBackEmbed,
  formatDuration,
};
