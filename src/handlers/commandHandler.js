const { Collection, REST, Routes } = require('discord.js');
const { commands } = require('../commands');
const { handleTrackStart } = require('../commands/track');
const { handleTag } = require('../commands/tag');
const { handleAfkSlash } = require('../commands/afk');
const {
  showAppealModal,
  handleAppealModalSubmit,
  handleAppealApprove,
  showDenyModal,
  handleAppealDenyModalSubmit,
} = require('../handlers/appealManager');
const {
  handleSetup,
  openTrackerSettings,
  openModSettings,
  openTagSettings,
  handlePingMenu,
  handleQuarantineStaffMenu,
  handleQuarantineLogsMenu,
  handleQuarantineRoleMenu,
  handleAppealChannelMenu,
  handleTagRoleMenu,
  handleTagRoleDisable,
  handleTagLogMenu,
  handleBack,
} = require('../commands/setup');
const { handleQuarantine, handleUnquarantine } = require('../commands/quarantine');
const {
  handleCopyPermsSourceMenu,
  handleCopyPermsDestMenu,
  handleCopyPermsConfirm,
  handleCopyPermsCancel,
} = require('../commands/copyperms');
const {
  handleEmbedCommand,
  handleEmbedButton,
  handleEmbedSelectMenu,
  handleEmbedModalSubmit,
} = require('../commands/embed');
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

  if (!token || !clientId) {
    logger.error('Missing DISCORD_TOKEN or CLIENT_ID — slash commands will not be registered with Discord');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info(`Successfully registered ${commands.length} slash commands globally.`);
  } catch (err) {
    logger.error('Failed to register global slash commands:', err.message);
  }
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

    if (commandName === 'afk') return handleAfkSlash(interaction);

    if (commandName === 'embed') return handleEmbedCommand(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'tracker_settings') return openTrackerSettings(interaction);
    if (interaction.customId === 'mod_settings') return openModSettings(interaction);
    if (interaction.customId === 'tag_settings') return openTagSettings(interaction);
    if (interaction.customId === 'tag_role_disable') return handleTagRoleDisable(interaction);
    if (interaction.customId === 'setup_back') return handleBack(interaction);

    if (interaction.customId.startsWith('appeal:')) {
      const quarantineId = interaction.customId.split(':')[1];
      return showAppealModal(interaction, quarantineId);
    }
    if (interaction.customId.startsWith('appeal_approve:')) {
      const quarantineId = interaction.customId.split(':')[1];
      return handleAppealApprove(interaction, quarantineId);
    }
    if (interaction.customId.startsWith('appeal_deny:')) {
      const quarantineId = interaction.customId.split(':')[1];
      return showDenyModal(interaction, quarantineId);
    }
    if (interaction.customId.startsWith('copyperms_cancel:')) {
      return handleCopyPermsCancel(interaction);
    }
    if (interaction.customId.startsWith('copyperms_confirm:')) {
      return handleCopyPermsConfirm(interaction);
    }

    if (interaction.customId.startsWith('embed_')) {
      return handleEmbedButton(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'tracker_ping_menu') return handlePingMenu(interaction);

    if (interaction.customId.startsWith('embed_')) {
      return handleEmbedSelectMenu(interaction);
    }
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'mod_quarantine_logs') return handleQuarantineLogsMenu(interaction);
    if (interaction.customId === 'tag_log_menu') return handleTagLogMenu(interaction);
    if (interaction.customId === 'mod_appeal_channel') return handleAppealChannelMenu(interaction);
    if (interaction.customId.startsWith('copyperms_src:')) {
      return handleCopyPermsSourceMenu(interaction);
    }
    if (interaction.customId.startsWith('copyperms_dest:')) {
      return handleCopyPermsDestMenu(interaction);
    }
  }

  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === 'mod_quarantine_staff') return handleQuarantineStaffMenu(interaction);
    if (interaction.customId === 'mod_quarantine_role') return handleQuarantineRoleMenu(interaction);
    if (interaction.customId === 'tag_role_menu') return handleTagRoleMenu(interaction);
  }

  if (interaction.isMentionableSelectMenu()) {
    if (interaction.customId === 'tracker_ping_menu') return handlePingMenu(interaction);
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('appeal_modal:')) {
      const quarantineId = interaction.customId.split(':')[1];
      return handleAppealModalSubmit(interaction, quarantineId);
    }
    if (interaction.customId.startsWith('appeal_deny_modal:')) {
      const quarantineId = interaction.customId.split(':')[1];
      return handleAppealDenyModalSubmit(interaction, quarantineId);
    }

    if (interaction.customId.startsWith('embed_modal_')) {
      return handleEmbedModalSubmit(interaction);
    }
  }
}

module.exports = { registerCommands, handleInteraction };
