const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');
const trackerManager = require('../tracker/trackerManager');
const Setup = require('../models/Setup');
const logger = require('../utils/logger');

async function getSetup(guildId) {
  let setup = await Setup.findOne({ guildId });
  if (!setup) {
    setup = await Setup.create({ guildId });
  }
  return setup;
}

async function handleSetup(interaction) {
  if (!interaction.memberPermissions || !interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const setup = await getSetup(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle('Bot Setup Dashboard')
    .setColor(0x2b2d31)
    .setDescription('Configure the bot below.');

  const trackerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tracker_settings')
      .setLabel('Tracker Settings')
      .setStyle(ButtonStyle.Primary),
  );

  const modRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mod_settings')
      .setLabel('Mod Settings')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.editReply({ embeds: [embed], components: [trackerRow, modRow] });
}

async function openTrackerSettings(interaction) {
  const setup = await getSetup(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle('Tracker Settings')
    .setColor(0x2b2d31)
    .setDescription('Choose the channel where the tracking embed is posted and the role/user to ping when the milestone is reached.')
    .addFields(
      {
        name: 'Current Channel',
        value: setup.trackerChannelId ? `<#${setup.trackerChannelId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Current Ping',
        value: setup.trackerPingId
          ? setup.trackerPingId.startsWith('role:')
            ? `<@&${setup.trackerPingId.slice(4)}>`
            : `<@${setup.trackerPingId}>`
          : 'Not set',
        inline: true,
      },
    );

  const channelMenu = new StringSelectMenuBuilder()
    .setCustomId('tracker_channel_menu')
    .setPlaceholder('Select tracking channel')
    .addOptions(
      interaction.guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildText)
        .first(25)
        .map((c) => ({ label: c.name, value: c.id })),
    );

  const roleMenu = new StringSelectMenuBuilder()
    .setCustomId('tracker_ping_menu')
    .setPlaceholder('Select role or user to ping')
    .addOptions(
      { label: 'None', value: 'none' },
      ...interaction.guild.roles.cache
        .filter((r) => r.id !== interaction.guild.id)
        .first(24)
        .map((r) => ({ label: `Role: ${r.name}`, value: `role:${r.id}` })),
    );

  const row1 = new ActionRowBuilder().addComponents(channelMenu);
  const row2 = new ActionRowBuilder().addComponents(roleMenu);

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup_back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row1, row2, backButton] });
}

async function openModSettings(interaction) {
  const setup = await getSetup(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle('Mod Settings')
    .setColor(0x2b2d31)
    .setDescription('Configure the Quarantine System below.')
    .addFields(
      {
        name: 'Quarantine Staff',
        value: setup.quarantineStaffRoleId ? `<@&${setup.quarantineStaffRoleId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Quarantine Logs',
        value: setup.quarantineLogChannelId ? `<#${setup.quarantineLogChannelId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Quarantine Role',
        value: setup.quarantineRoleId ? `<@&${setup.quarantineRoleId}>` : 'Not set',
        inline: true,
      },
    );

  const staffMenu = new RoleSelectMenuBuilder()
    .setCustomId('mod_quarantine_staff')
    .setPlaceholder('Select Quarantine Staff role');

  const logMenu = new StringSelectMenuBuilder()
    .setCustomId('mod_quarantine_logs')
    .setPlaceholder('Select Quarantine Logs channel')
    .addOptions(
      interaction.guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildText)
        .first(25)
        .map((c) => ({ label: c.name, value: c.id })),
    );

  const quarantineRoleMenu = new RoleSelectMenuBuilder()
    .setCustomId('mod_quarantine_role')
    .setPlaceholder('Select Quarantine Role');

  const row1 = new ActionRowBuilder().addComponents(staffMenu);
  const row2 = new ActionRowBuilder().addComponents(logMenu);
  const row3 = new ActionRowBuilder().addComponents(quarantineRoleMenu);
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup_back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row1, row2, row3, row4] });
}

async function handleChannelMenu(interaction) {
  const channelId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { trackerChannelId: channelId }, { upsert: true });
  return interaction.reply({ content: `Tracking channel set to <#${channelId}>.`, ephemeral: true });
}

async function handlePingMenu(interaction) {
  const value = interaction.values[0];
  const pingId = value === 'none' ? null : value;
  await Setup.updateOne({ guildId: interaction.guildId }, { trackerPingId: pingId }, { upsert: true });

  const display = pingId
    ? pingId.startsWith('role:')
      ? `<@&${pingId.slice(4)}>`
      : `<@${pingId}>`
    : 'None';

  return interaction.reply({ content: `Milestone ping set to ${display}.`, ephemeral: true });
}

async function handleQuarantineStaffMenu(interaction) {
  const roleId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { quarantineStaffRoleId: roleId }, { upsert: true });
  return interaction.reply({ content: `Quarantine Staff role set to <@&${roleId}>.`, ephemeral: true });
}

async function handleQuarantineLogsMenu(interaction) {
  const channelId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { quarantineLogChannelId: channelId }, { upsert: true });
  return interaction.reply({ content: `Quarantine Logs channel set to <#${channelId}>.`, ephemeral: true });
}

async function handleQuarantineRoleMenu(interaction) {
  const roleId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { quarantineRoleId: roleId }, { upsert: true });
  return interaction.reply({ content: `Quarantine Role set to <@&${roleId}>.`, ephemeral: true });
}

async function handleBack(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Bot Setup Dashboard')
    .setColor(0x2b2d31)
    .setDescription('Configure the bot below.');

  const trackerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tracker_settings')
      .setLabel('Tracker Settings')
      .setStyle(ButtonStyle.Primary),
  );

  const modRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mod_settings')
      .setLabel('Mod Settings')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [trackerRow, modRow] });
}

module.exports = {
  handleSetup,
  openTrackerSettings,
  openModSettings,
  handleChannelMenu,
  handlePingMenu,
  handleQuarantineStaffMenu,
  handleQuarantineLogsMenu,
  handleQuarantineRoleMenu,
  handleBack,
};
