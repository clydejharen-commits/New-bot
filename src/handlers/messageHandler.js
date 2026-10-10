const { PREFIX: rawPrefix } = process.env;
const PREFIX = (rawPrefix || 'w!').trim();
const { handleTrackStop } = require('../commands/track');
const { handleQuarantine, handleUnquarantine } = require('../commands/quarantine');
const { handleSend } = require('../commands/send');
const { handleCrename } = require('../commands/crename');
const { handleAfkPrefix } = require('../commands/afk');
const afkManager = require('./afkManager');
const AfkStatus = require('../models/AfkStatus');
const logger = require('../utils/logger');

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const isPrefixCommand = message.content.trim().toLowerCase().startsWith(PREFIX.toLowerCase());

  if (isPrefixCommand) {
    const body = message.content.trim().slice(PREFIX.length).trim();
    const parts = body.split(/\s+/);
    const command = (parts[0] || '').toLowerCase();

    if (command === 'track') {
      const sub = (parts[1] || '').toLowerCase();
      if (sub === 'stop') {
        return handleTrackStop(message);
      }
      return message.reply(`Unknown track subcommand. Use \`${PREFIX} Track stop\`.`);
    }

    if (command === 'quarantine') {
      const ctx = buildPrefixCtx(message, parts.slice(1));
      return handleQuarantine(ctx);
    }

    if (command === 'unquarantine') {
      const ctx = buildPrefixCtx(message, parts.slice(1));
      return handleUnquarantine(ctx);
    }

    if (command === 'send') {
      return handleSend(message, parts.slice(1));
    }

    if (command === 'crename') {
      return handleCrename(message, parts.slice(1));
    }

    if (command === 'afk') {
      return handleAfkPrefix(message, parts.slice(1));
    }
  }

  await processAfkMentions(message);

  await processAfkReturn(message);
}

async function processAfkMentions(message) {
  const mentionedUserIds = new Set();
  for (const user of message.mentions.users.values()) {
    if (user.id !== message.author.id) {
      mentionedUserIds.add(user.id);
    }
  }
  if (mentionedUserIds.size === 0) return;

  try {
    const afkDocs = await afkManager.getAfkStatuses([...mentionedUserIds], message.guild.id);
    if (afkDocs.length === 0) return;

    const lines = [];
    for (const doc of afkDocs) {
      const duration = afkManager.formatDuration(Date.now() - new Date(doc.setAt).getTime());
      const member = message.guild.members.cache.get(doc.userId);
      const displayName = member ? member.user.username : doc.userId;
      lines.push(`**${displayName}** is AFK: ${doc.reason} (${duration})`);

      if (doc.userId !== message.author.id) {
        await afkManager.addMentioner(doc.userId, message.guild.id, message.author.id, message.author.username);
      }
    }

    if (lines.length > 0) {
      await message.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
    }
  } catch (err) {
    logger.error('AFK mention check error:', err.message);
  }
}

async function processAfkReturn(message) {
  let afkDoc;
  try {
    afkDoc = await AfkStatus.findOne({ userId: message.author.id, guildId: message.guild.id }).lean();
  } catch (err) {
    logger.error('AFK return check error:', err.message);
    return;
  }

  if (!afkDoc) return;

  try {
    const embed = await afkManager.buildWelcomeBackEmbed(afkDoc);
    await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (err) {
    logger.error('AFK welcome-back embed error:', err.message);
  }

  try {
    await afkManager.clearAfkStatus(message.author.id, message.guild.id);
  } catch (err) {
    logger.error('AFK clear error:', err.message);
  }
}

function buildPrefixCtx(message, args) {
  return {
    content: message.content,
    guild: message.guild,
    member: message.member,
    author: message.author,
    mentions: message.mentions,
    args,
    channel: message.channel,
    respond(text) {
      return message.reply(text);
    },
    async acknowledge() {
      // Prefix commands don't need explicit acknowledgment
    },
    async followUp(payload) {
      return message.reply(payload);
    },
  };
}

module.exports = { handleMessage };
