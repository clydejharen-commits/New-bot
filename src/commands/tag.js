const tagManager = require('../handlers/tagManager');

async function handleTag(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'verify') return tagManager.handleVerify(interaction);
}

module.exports = { handleTag };
