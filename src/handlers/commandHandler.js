const { Collection } = require('discord.js');
const { commands } = require('../commands');
const { handleTrackStart, handleTrackStop } = require('../commands/track');
const { handleSetup, openTrackerSettings, handleChannelMenu, handlePingMenu } = require('../commands/setup');
const logger = require('../utils/logger');

function registerCommands(client) {
  client.commands = new Collection();
  client.commandData = commands;
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'track') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'start') return handleTrackStart(interaction);
      if (sub === 'stop') return handleTrackStop(interaction);
    }

    if (commandName === 'setup') return handleSetup(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'tracker_settings') return openTrackerSettings(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'tracker_channel_menu') return handleChannelMenu(interaction);
    if (interaction.customId === 'tracker_ping_menu') return handlePingMenu(interaction);
  }
}

module.exports = { registerCommands, handleInteraction };
