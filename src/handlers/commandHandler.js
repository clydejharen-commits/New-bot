const { Collection } = require('discord.js');
const { commands } = require('../commands');
const { handleTrackStart, handleTrackStop } = require('../commands/track');
const {
  handleSetup,
  openTrackerSettings,
  openModSettings,
  handleChannelMenu,
  handlePingMenu,
  handleQuarantineStaffMenu,
  handleQuarantineLogsMenu,
  handleQuarantineRoleMenu,
  handleBack,
} = require('../commands/setup');
const { handleQuarantine, handleUnquarantine } = require('../commands/quarantine');
const logger = require('../utils/logger');

function wrapInteractionCtx(interaction) {
  return {
    content: undefined,
    guild: interaction.guild,
    member: interaction.member,
    author: interaction.user,
    mentions: interaction.mentions,
    args: [],
    channel: interaction.channel,
    options: interaction.options,
    respond(payload) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply(payload);
      }
      return interaction.reply(typeof payload === 'string' ? { content: payload, ephemeral: true } : { ...payload, ephemeral: true });
    },
    async acknowledge() {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    },
    followUp(payload) {
      if (interaction.deferred && !interaction.replied) {
        return interaction.editReply(payload);
      }
      if (interaction.replied) {
        return interaction.followUp(typeof payload === 'string' ? { content: payload, ephemeral: true } : { ...payload, ephemeral: true });
      }
      return interaction.reply(typeof payload === 'string' ? { content: payload, ephemeral: true } : { ...payload, ephemeral: true });
    },
  };
}

function registerCommands(client) {
  client.commands = new Collection();
  client.commandData = commands;
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'track') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'start') return handleTrackStart(interaction);
      if (sub === 'stop') return handleTrackStop(interaction);
    }

    if (commandName === 'setup') return handleSetup(interaction);

    if (commandName === 'quarantine') {
      return handleQuarantine(wrapInteractionCtx(interaction));
    }

    if (commandName === 'unquarantine') {
      return handleUnquarantine(wrapInteractionCtx(interaction));
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'tracker_settings') return openTrackerSettings(interaction);
    if (interaction.customId === 'mod_settings') return openModSettings(interaction);
    if (interaction.customId === 'setup_back') return handleBack(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'tracker_channel_menu') return handleChannelMenu(interaction);
    if (interaction.customId === 'tracker_ping_menu') return handlePingMenu(interaction);
    if (interaction.customId === 'mod_quarantine_staff') return handleQuarantineStaffMenu(interaction);
    if (interaction.customId === 'mod_quarantine_logs') return handleQuarantineLogsMenu(interaction);
    if (interaction.customId === 'mod_quarantine_role') return handleQuarantineRoleMenu(interaction);
  }

  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === 'mod_quarantine_staff') return handleQuarantineStaffMenu(interaction);
    if (interaction.customId === 'mod_quarantine_role') return handleQuarantineRoleMenu(interaction);
  }
}

module.exports = { registerCommands, handleInteraction };
