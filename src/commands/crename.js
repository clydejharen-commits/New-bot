const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

async function handleCrename(message, args) {
  let member = message.member;
  if (!member) {
    try {
      member = await message.guild.members.fetch(message.author.id);
    } catch (err) {
      logger.error(`crename: failed to fetch member ${message.author.id}: ${err.message}`);
      return message.reply('Could not verify your permissions. Please try again.');
    }
  }

  if (!member.permissions || !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply('You need the **Manage Channels** permission to use this command.');
  }

  const botMember = message.guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply('I lack the **Manage Channels** permission required to rename channels.');
  }

  const name = args.join(' ').trim();

  if (!name) {
    return message.reply('Usage: `w! crename (name)`');
  }

  if (name.length < 1 || name.length > 100) {
    return message.reply('Channel name must be between 1 and 100 characters.');
  }

  try {
    await message.channel.setName(name, `Requested by ${message.author.tag}`);
  } catch (err) {
    logger.error(`crename: failed to rename channel ${message.channel.id}: ${err.message}`);
    return message.reply(`Failed to rename channel: ${err.message}`);
  }

  return message.reply(`Channel renamed to **${name}**.`);
}

module.exports = { handleCrename };
