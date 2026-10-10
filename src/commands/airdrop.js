const airdropManager = require('../handlers/airdropManager');

async function handleAirdrop(interaction) {
  const prize = interaction.options.getString('prize');
  const maxClaims = interaction.options.getInteger('max_claims');
  const duration = interaction.options.getInteger('duration');

  return airdropManager.createAirdrop({ interaction, prize, maxClaims, durationMinutes: duration });
}

module.exports = { handleAirdrop };
