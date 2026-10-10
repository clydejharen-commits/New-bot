const { PermissionFlagsBits } = require('discord.js');

async function handleCrename(message, args) {
  if (!message.memberPermissions || !message.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
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
    return message.reply(`Failed to rename channel: ${err.message}`);
  }

  return message.reply(`Channel renamed to **${name}**.`);
}

module.exports = { handleCrename };
