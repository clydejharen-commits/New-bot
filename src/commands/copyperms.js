const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logger = require('../utils/logger');

const PANEL_TIMEOUT_MS = 120_000;

const CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
];

function isAdmin(member) {
  return !!(member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator));
}

function channelMention(channel) {
  if (!channel) return 'Unknown';
  if (channel.type === ChannelType.GuildCategory) return `**${channel.name}** (Category)`;
  return `<#${channel.id}>`;
}

function buildSourcePanel(userId) {
  const embed = new EmbedBuilder()
    .setTitle('Copy Channel Permissions')
    .setColor(0x2b2d31)
    .setDescription(
      'Select the **source** channel or category whose permission overwrites you want to copy.\n\n' +
      'Only the Administrator who ran this command can interact with this panel.',
    )
    .setFooter({ text: `Initiated by <@${userId}> • Panel expires in 2 minutes` })
    .setTimestamp();

  const sourceMenu = new ChannelSelectMenuBuilder()
    .setCustomId(`copyperms_src:${userId}`)
    .setPlaceholder('Select source channel or category')
    .addChannelTypes(CHANNEL_TYPES)
    .setMinValues(1)
    .setMaxValues(1);

  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`copyperms_cancel:${userId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(sourceMenu), cancelRow] };
}

function buildDestPanel(userId, sourceChannel) {
  const embed = new EmbedBuilder()
    .setTitle('Copy Channel Permissions')
    .setColor(0x2b2d31)
    .setDescription(
      `Source selected: ${channelMention(sourceChannel)}\n\n` +
      'Now select the **destination** channel or category where the permission overwrites will be applied.\n\n' +
      'The destination\'s existing explicit permission overwrites will be **replaced**.',
    )
    .setFooter({ text: `Initiated by <@${userId}> • Panel expires in 2 minutes` })
    .setTimestamp();

  const destMenu = new ChannelSelectMenuBuilder()
    .setCustomId(`copyperms_dest:${userId}:${sourceChannel.id}`)
    .setPlaceholder('Select destination channel or category')
    .addChannelTypes(CHANNEL_TYPES)
    .setMinValues(1)
    .setMaxValues(1);

  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`copyperms_cancel:${userId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(destMenu), cancelRow] };
}

function buildReviewPanel(userId, sourceChannel, destChannel) {
  const overwriteCount = sourceChannel.permissionOverwrites?.cache?.size ?? 0;

  const embed = new EmbedBuilder()
    .setTitle('Copy Channel Permissions — Review')
    .setColor(0xf1c40f)
    .addFields(
      { name: 'Source', value: channelMention(sourceChannel), inline: true },
      { name: 'Destination', value: channelMention(destChannel), inline: true },
      { name: 'Overwrites to Copy', value: `${overwriteCount} explicit overwrite(s)`, inline: true },
      {
        name: '⚠️ Warning',
        value:
          'The destination\'s existing explicit permission overwrites will be **completely replaced** by the source\'s overwrites.\n' +
          'This includes role-specific and member-specific overwrites. The source will not be modified.\n\n' +
          'Note: Inherited category permissions can also affect a channel\'s effective permissions.',
        inline: false,
      },
    )
    .setFooter({ text: `Initiated by <@${userId}> • Panel expires in 2 minutes` })
    .setTimestamp();

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`copyperms_confirm:${userId}:${sourceChannel.id}:${destChannel.id}`)
      .setLabel('Confirm — Copy Permissions')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`copyperms_cancel:${userId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [confirmRow] };
}

function buildExpiredPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Copy Channel Permissions — Expired')
        .setColor(0x95a5a6)
        .setDescription('This panel has expired. Run `w! copyperms` again to start a new session.'),
    ],
    components: [],
  };
}

function buildCancelledPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Copy Channel Permissions — Cancelled')
        .setColor(0x95a5a6)
        .setDescription('The permission copy operation has been cancelled.'),
    ],
    components: [],
  };
}

function buildSuccessEmbed(sourceChannel, destChannel, overwriteCount, userId) {
  return new EmbedBuilder()
    .setTitle('✅ Permissions Copied')
    .setColor(0x2ecc71)
    .addFields(
      { name: 'Source', value: channelMention(sourceChannel), inline: true },
      { name: 'Destination', value: channelMention(destChannel), inline: true },
      { name: 'Overwrites Applied', value: `${overwriteCount}`, inline: true },
    )
    .setFooter({ text: `Copied by <@${userId}>` })
    .setTimestamp();
}

function buildErrorEmbed(message) {
  return new EmbedBuilder()
    .setTitle('❌ Permission Copy Failed')
    .setColor(0xe74c3c)
    .setDescription(message)
    .setTimestamp();
}

async function resolveChannel(guild, channelId) {
  try {
    return await guild.channels.fetch(channelId);
  } catch {
    return null;
  }
}

async function handleCopyPerms(message) {
  const member = message.member;
  if (!isAdmin(member)) {
    return message.reply('You need the **Administrator** permission to use this command.');
  }

  const botMember = message.guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return message.reply('I lack the **Manage Roles** permission required to modify channel permission overwrites.');
  }

  const payload = buildSourcePanel(message.author.id);

  let sentMessage;
  try {
    sentMessage = await message.channel.send(payload);
  } catch (err) {
    logger.error(`copyperms: failed to send panel: ${err.message}`);
    return message.reply('Failed to open the setup panel. Please try again.');
  }

  setTimeout(async () => {
    try {
      await sentMessage.edit(buildExpiredPanel());
    } catch {
      // message may have been deleted
    }
  }, PANEL_TIMEOUT_MS);

  return sentMessage;
}

async function handleSourceMenu(interaction) {
  const parts = interaction.customId.split(':');
  const userId = parts[1];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'Only the Administrator who initiated this command can use this panel.', ephemeral: true });
  }

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'You no longer have Administrator permission.', ephemeral: true });
  }

  const sourceChannelId = interaction.values[0];
  const sourceChannel = await resolveChannel(interaction.guild, sourceChannelId);
  if (!sourceChannel || sourceChannel.guild.id !== interaction.guild.id) {
    return interaction.update({ embeds: [buildErrorEmbed('The selected source could not be found in this server.')], components: [] });
  }

  return interaction.update(buildDestPanel(userId, sourceChannel));
}

async function handleDestMenu(interaction) {
  const parts = interaction.customId.split(':');
  const userId = parts[1];
  const sourceChannelId = parts[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'Only the Administrator who initiated this command can use this panel.', ephemeral: true });
  }

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'You no longer have Administrator permission.', ephemeral: true });
  }

  const destChannelId = interaction.values[0];
  const sourceChannel = await resolveChannel(interaction.guild, sourceChannelId);
  const destChannel = await resolveChannel(interaction.guild, destChannelId);

  if (!sourceChannel || sourceChannel.guild.id !== interaction.guild.id) {
    return interaction.update({ embeds: [buildErrorEmbed('The source channel could no longer be found. Please start over with `w! copyperms`.')], components: [] });
  }
  if (!destChannel || destChannel.guild.id !== interaction.guild.id) {
    return interaction.update({ embeds: [buildErrorEmbed('The selected destination could not be found in this server.')], components: [] });
  }

  if (sourceChannel.id === destChannel.id) {
    return interaction.reply({ content: 'The destination cannot be the same as the source. Please select a different destination.', ephemeral: true });
  }

  return interaction.update(buildReviewPanel(userId, sourceChannel, destChannel));
}

async function handleConfirm(interaction) {
  const parts = interaction.customId.split(':');
  const userId = parts[1];
  const sourceChannelId = parts[2];
  const destChannelId = parts[3];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'Only the Administrator who initiated this command can confirm this operation.', ephemeral: true });
  }

  if (!isAdmin(interaction.member)) {
    return interaction.update({ embeds: [buildErrorEmbed('You no longer have Administrator permission. The operation was not performed.')], components: [] });
  }

  const sourceChannel = await resolveChannel(interaction.guild, sourceChannelId);
  const destChannel = await resolveChannel(interaction.guild, destChannelId);

  if (!sourceChannel || sourceChannel.guild.id !== interaction.guild.id) {
    return interaction.update({ embeds: [buildErrorEmbed('The source channel could no longer be found in this server.')], components: [] });
  }
  if (!destChannel || destChannel.guild.id !== interaction.guild.id) {
    return interaction.update({ embeds: [buildErrorEmbed('The destination channel could no longer be found in this server.')], components: [] });
  }

  if (sourceChannel.id === destChannel.id) {
    return interaction.update({ embeds: [buildErrorEmbed('Source and destination are the same. Nothing was changed.')], components: [] });
  }

  const overwriteEntries = [...sourceChannel.permissionOverwrites.cache.values()];

  for (const ow of overwriteEntries) {
    if (ow.type === 0) {
      const role = interaction.guild.roles.cache.get(ow.id);
      if (!role) {
        logger.warn(`copyperms: role ${ow.id} in source overwrites no longer exists in guild ${interaction.guild.id}`);
      }
    } else if (ow.type === 1) {
      try {
        await interaction.guild.members.fetch(ow.id);
      } catch {
        logger.warn(`copyperms: member ${ow.id} in source overwrites no longer exists in guild ${interaction.guild.id}`);
      }
    }
  }

  const botMember = interaction.guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.update({ embeds: [buildErrorEmbed('I lack the **Manage Roles** permission required to modify permission overwrites.')], components: [] });
  }

  if (destChannel.type !== ChannelType.GuildCategory) {
    if (!destChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.update({ embeds: [buildErrorEmbed(`I do not have permission to manage ${channelMention(destChannel)}.`)], components: [] });
    }
  }

  const newOverwrites = overwriteEntries.map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow,
    deny: ow.deny,
  }));

  try {
    await destChannel.permissionOverwrites.set(newOverwrites, `Copy perms from ${sourceChannel.name} by ${interaction.user.tag}`);
    const successEmbed = buildSuccessEmbed(sourceChannel, destChannel, newOverwrites.length, userId);
    logger.info(`copyperms: copied ${newOverwrites.length} overwrites from ${sourceChannel.id} to ${destChannel.id} by ${userId} in guild ${interaction.guild.id}`);
    return interaction.update({ embeds: [successEmbed], components: [] });
  } catch (err) {
    logger.error(`copyperms: failed to apply overwrites to ${destChannel.id}: ${err.message}`);
    return interaction.update({ embeds: [buildErrorEmbed(`Failed to apply permission overwrites: ${err.message}`)], components: [] });
  }
}

async function handleCancel(interaction) {
  const parts = interaction.customId.split(':');
  const userId = parts[1];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'Only the Administrator who initiated this command can cancel this operation.', ephemeral: true });
  }

  return interaction.update(buildCancelledPanel());
}

module.exports = {
  handleCopyPerms,
  handleCopyPermsSourceMenu: handleSourceMenu,
  handleCopyPermsDestMenu: handleDestMenu,
  handleCopyPermsConfirm: handleConfirm,
  handleCopyPermsCancel: handleCancel,
};
