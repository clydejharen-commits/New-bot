const { PREFIX: rawPrefix } = process.env;
const PREFIX = (rawPrefix || 'w!').trim();
const { handleTrackStop } = require('../commands/track');
const { handleQuarantine, handleUnquarantine } = require('../commands/quarantine');

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  if (!content.toLowerCase().startsWith(PREFIX.toLowerCase())) return;

  const body = content.slice(PREFIX.length).trim();
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
