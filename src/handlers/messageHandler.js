const { PREFIX: rawPrefix } = process.env;
const PREFIX = (rawPrefix || 'w!').trim();
const logger = require('../utils/logger');
const { handleTrackStop } = require('../commands/track');

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  if (!content.toLowerCase().startsWith(PREFIX.toLowerCase())) return;

  const body = content.slice(PREFIX.length).trim();
  const parts = body.split(/\s+/);
  const command = (parts[0] || '').toLowerCase();

  if (command !== 'track') return;

  const sub = (parts[1] || '').toLowerCase();

  if (sub === 'stop') {
    await handleTrackStop(message);
  } else {
    await message.reply(`Unknown track subcommand. Use \`${PREFIX} Track stop\`.`);
  }
}

module.exports = { handleMessage };
