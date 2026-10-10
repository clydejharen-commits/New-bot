require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { registerCommands, handleInteraction } = require('./handlers/commandHandler');
const { handleMessage } = require('./handlers/messageHandler');
const { restoreTracker, setClient } = require('./tracker/trackerManager');
const { checkAllMembers, handleUserUpdate, handleGuildMemberAdd } = require('./handlers/tagManager');
const { restoreAirdrops, setClient: setAirdropClient } = require('./handlers/airdropManager');

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
  setAirdropClient(client);

  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  await registerCommands(client).catch((err) => {
    logger.error('Failed to register slash commands:', err.message);
  });

  try {
    await restoreTracker(client);
    logger.info('Tracker restore check complete');
  } catch (err) {
    logger.error('Failed to restore tracker:', err.message);
  }

  try {
    await checkAllMembers(client);
    logger.info('Auto Tag Role member check complete');
  } catch (err) {
    logger.error('Failed to check members for tag roles:', err.message);
  }

  try {
    await restoreAirdrops(client);
    logger.info('Airdrop restore check complete');
  } catch (err) {
    logger.error('Failed to restore airdrops:', err.message);
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

client.on('userUpdate', async (oldUser, newUser) => {
  try {
    await handleUserUpdate(client, oldUser, newUser);
  } catch (err) {
    logger.error('User update error:', err.message);
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    await handleGuildMemberAdd(member);
  } catch (err) {
    logger.error('Guild member add error:', err.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
