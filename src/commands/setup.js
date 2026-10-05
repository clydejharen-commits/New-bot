const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const trackerManager = require('../tracker/trackerManager');
const Setup = require('../models/Setup');

async function handleSetup(interaction) {
  if (!interaction.memberPermissions || !interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
  }

  const setup = await trackerManager.getSetup(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle('Bot Setup Dashboard')
    .setColor(0x2b2d31)
    .setDescription('Configure the Roblox Followers Tracking System below.')
    .addFields(
      {
        name: 'Tracker Channel',
        value: setup.trackerChannelId ? `<#${setup.trackerChannelId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Milestone Ping',
        value: setup.trackerPingId
          ? setup.trackerPingId.startsWith('role:')
            ? `<@&${setup.trackerPingId.slice(4)}>`
            : `<@${setup.trackerPingId}>`
          : 'Not set',
        inline: true,
      },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tracker_settings')
      .setLabel('Tracker Settings')
      .setStyle(ButtonStyle.Primary),
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function openTrackerSettings(interaction) {
  const setup = await trackerManager.getSetup(interaction.guildId);

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

  return interaction.update({ embeds: [embed], components: [row1, row2] });
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

module.exports = { handleSetup, openTrackerSettings, handleChannelMenu, handlePingMenu };
