const afkManager = require('../handlers/afkManager');

async function handleAfkSlash(interaction) {
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    await afkManager.setAfkStatus(interaction.user.id, interaction.guildId, reason);
  } catch (err) {
    return interaction.reply({ content: 'Failed to set your AFK status. Please try again.', ephemeral: true });
  }

  return interaction.reply({ content: `You are now AFK: **${reason}**`, allowedMentions: { parse: [] } });
}

async function handleAfkPrefix(message, args) {
  const reason = args.join(' ').trim() || 'No reason provided';

  try {
    await afkManager.setAfkStatus(message.author.id, message.guild.id, reason);
  } catch (err) {
    return message.reply('Failed to set your AFK status. Please try again.');
  }

  return message.reply(`You are now AFK: **${reason}**`, { allowedMentions: { parse: [] } });
}

module.exports = { handleAfkSlash, handleAfkPrefix };
