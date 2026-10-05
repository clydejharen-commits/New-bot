require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { registerCommands, handleInteraction } = require('./handlers/commandHandler');
const { handleMessage } = require('./handlers/messageHandler');
const { restoreTracker, setClient } = require('./tracker/trackerManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

client.once('ready', async () => {
  logger.info(`Logged in as ${client.user.tag}`);
  setClient(client);

  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  await registerCommands(client);
  logger.info('Slash commands registered');

  try {
    await restoreTracker(client);
    logger.info('Tracker restore check complete');
  } catch (err) {
    logger.error('Failed to restore tracker:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    logger.error('Interaction error:', err.message);
  }
});

client.on('messageCreate', async (message) => {
  try {
    await handleMessage(message);
  } catch (err) {
    logger.error('Message error:', err.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
