require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { commands } = require('../commands');
const logger = require('../utils/logger');

async function deployCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    logger.error('Missing DISCORD_TOKEN or CLIENT_ID in environment');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const guildId = process.env.GUILD_ID;

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      logger.info(`Registered ${commands.length} guild commands to ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.info(`Registered ${commands.length} global commands`);
    }
  } catch (err) {
    logger.error('Failed to deploy commands:', err.message);
    process.exit(1);
  }
}

deployCommands();
