const { Collection, REST, Routes } = require('discord.js');
const { commands } = require('../commands');
const { handleTrackStart } = require('../commands/track');
const { handleTag } = require('../commands/tag');
const {
  handleSetup,
  openTrackerSettings,
  openModSettings,
  openTagSettings,
  handlePingMenu,
  handleQuarantineStaffMenu,
  handleQuarantineLogsMenu,
  handleQuarantineRoleMenu,
  handleTagRoleMenu,
  handleTagRoleDisable,
  handleTagLogMenu,
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

async function registerCommands(client) {
  client.commands = new Collection();
  client.commandData = commands;

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    logger.error('Missing DISCORD_TOKEN or CLIENT_ID — slash commands will not be registered with Discord');
    return;
  }

  if (!guildId) {
    logger.warn('GUILD_ID is not set — commands will be registered globally instead of to a specific guild');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });

  logger.info(`Successfully registered ${commands.length} slash commands${guildId ? ` to guild ${guildId}` : ' globally'}.`);
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'track') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'start') return handleTrackStart(interaction);
    }

    if (commandName === 'setup') return handleSetup(interaction);

    if (commandName === 'quarantine') {
      return handleQuarantine(wrapInteractionCtx(interaction));
    }

    if (commandName === 'unquarantine') {
      return handleUnquarantine(wrapInteractionCtx(interaction));
    }

    if (commandName === 'tag') return handleTag(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'tracker_settings') return openTrackerSettings(interaction);
    if (interaction.customId === 'mod_settings') return openModSettings(interaction);
    if (interaction.customId === 'tag_settings') return openTagSettings(interaction);
    if (interaction.customId === 'tag_role_disable') return handleTagRoleDisable(interaction);
    if (interaction.customId === 'setup_back') return handleBack(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'tracker_ping_menu') return handlePingMenu(interaction);
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'mod_quarantine_logs') return handleQuarantineLogsMenu(interaction);
    if (interaction.customId === 'tag_log_menu') return handleTagLogMenu(interaction);
  }

  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === 'mod_quarantine_staff') return handleQuarantineStaffMenu(interaction);
    if (interaction.customId === 'mod_quarantine_role') return handleQuarantineRoleMenu(interaction);
    if (interaction.customId === 'tag_role_menu') return handleTagRoleMenu(interaction);
  }

  if (interaction.isMentionableSelectMenu()) {
    if (interaction.customId === 'tracker_ping_menu') return handlePingMenu(interaction);
  }
}

module.exports = { registerCommands, handleInteraction };
