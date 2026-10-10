const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const Airdrop = require('../models/Airdrop');
const Setup = require('../models/Setup');
const logger = require('../utils/logger');

let clientRef = null;
const expirationTimers = new Map();

function setClient(client) {
  clientRef = client;
}

async function getSetup(guildId) {
  let setup = await Setup.findOne({ guildId });
  if (!setup) {
    setup = await Setup.create({ guildId });
  }
  return setup;
}

async function canCreateAirdrop(member, setup) {
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (setup.airdropAllowedUsers && setup.airdropAllowedUsers.includes(member.id)) return true;
  if (setup.airdropAllowedRoles && member.roles) {
    for (const roleId of setup.airdropAllowedRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

function formatDuration(ms) {
  if (ms <= 0) return 'Expired';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && days === 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(' ') : '0s';
}

function buildAirdropEmbed(airdrop) {
  const now = Date.now();
  const remaining = new Date(airdrop.expiresAt).getTime() - now;
  const claimsLeft = airdrop.maxClaims - airdrop.claimCount;
  const expired = remaining <= 0;
  const full = claimsLeft <= 0;
  const active = !expired && !full && airdrop.status === 'active';

  const embed = new EmbedBuilder()
    .setTitle('🎁 Airdrop')
    .setColor(active ? 0x00b06b : 0xed4245)
    .addFields(
      { name: 'Prize', value: airdrop.prize, inline: false },
      { name: 'Max Claims', value: String(airdrop.maxClaims), inline: true },
      { name: 'Remaining Claims', value: String(Math.max(claimsLeft, 0)), inline: true },
      { name: 'Time Remaining', value: expired ? 'Expired' : formatDuration(remaining), inline: true },
    )
    .setFooter({ text: active ? 'Click the button below to claim!' : 'This airdrop is no longer available.' })
    .setTimestamp();

  if (!active) {
    embed.setColor(0xed4245);
    if (expired) embed.addFields({ name: 'Status', value: 'Expired', inline: false });
    if (full) embed.addFields({ name: 'Status', value: 'All claims have been fulfilled', inline: false });
  }

  return embed;
}

function buildClaimButton(active) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`airdrop_claim_${active ? 'active' : 'inactive'}`)
      .setLabel('🎁 Claim')
      .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!active),
  );
}

async function createAirdrop({ interaction, prize, maxClaims, durationMinutes }) {
  const setup = await getSetup(interaction.guildId);

  const allowed = await canCreateAirdrop(interaction.member, setup);
  if (!allowed) {
    return interaction.reply({ content: 'You do not have permission to create Airdrops.', ephemeral: true });
  }

  if (!prize || prize.trim().length === 0) {
    return interaction.reply({ content: 'You must provide a prize description.', ephemeral: true });
  }

  if (!maxClaims || maxClaims < 1) {
    return interaction.reply({ content: 'Maximum claims must be at least 1.', ephemeral: true });
  }

  if (!durationMinutes || durationMinutes < 1) {
    return interaction.reply({ content: 'Duration must be at least 1 minute.', ephemeral: true });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle('🎁 Airdrop')
    .setColor(0x00b06b)
    .addFields(
      { name: 'Prize', value: prize, inline: false },
      { name: 'Max Claims', value: String(maxClaims), inline: true },
      { name: 'Remaining Claims', value: String(maxClaims), inline: true },
      { name: 'Time Remaining', value: formatDuration(durationMinutes * 60 * 1000), inline: true },
    )
    .setFooter({ text: 'Click the button below to claim!' })
    .setTimestamp();

  const row = buildClaimButton(true);
  const publicMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

  const airdrop = await Airdrop.create({
    guildId: interaction.guildId,
    creatorId: interaction.user.id,
    prize,
    maxClaims,
    claimCount: 0,
    claimantIds: [],
    messageId: publicMessage.id,
    channelId: interaction.channelId,
    createdAt: now,
    expiresAt,
    status: 'active',
    ticketChannelIds: [],
  });

  scheduleExpiration(airdrop);

  await interaction.editReply({ content: `Airdrop created successfully! It will expire <t:${Math.floor(expiresAt.getTime() / 1000)}:R>.`, ephemeral: true });
}

async function updatePublicEmbed(airdrop) {
  if (!clientRef) return;
  try {
    const guild = clientRef.guilds.cache.get(airdrop.guildId) || await clientRef.guilds.fetch(airdrop.guildId).catch(() => null);
    if (!guild) return;
    const channel = guild.channels.cache.get(airdrop.channelId) || await guild.channels.fetch(airdrop.channelId).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(airdrop.messageId).catch(() => null);
    if (!message) return;

    const now = Date.now();
    const remaining = new Date(airdrop.expiresAt).getTime() - now;
    const expired = remaining <= 0;
    const full = airdrop.claimCount >= airdrop.maxClaims;
    const active = !expired && !full && airdrop.status === 'active';

    const embed = buildAirdropEmbed(airdrop);
    const row = buildClaimButton(active);
    await message.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.error(`Failed to update public airdrop embed: ${err.message}`);
  }
}

async function handleClaim(interaction) {
  const airdrop = await Airdrop.findOne({ messageId: interaction.message.id, status: 'active' });

  if (!airdrop) {
    return interaction.reply({ content: 'This airdrop is no longer active.', ephemeral: true });
  }

  const now = Date.now();
  if (now >= new Date(airdrop.expiresAt).getTime()) {
    airdrop.status = 'expired';
    await airdrop.save();
    await updatePublicEmbed(airdrop);
    clearExpirationTimer(airdrop._id);
    return interaction.reply({ content: 'This airdrop has expired.', ephemeral: true });
  }

  if (airdrop.claimantIds.includes(interaction.user.id)) {
    return interaction.reply({ content: 'You have already claimed this airdrop.', ephemeral: true });
  }

  if (airdrop.claimCount >= airdrop.maxClaims) {
    airdrop.status = 'full';
    await airdrop.save();
    await updatePublicEmbed(airdrop);
    return interaction.reply({ content: 'This airdrop has reached its maximum claims.', ephemeral: true });
  }

  const updated = await Airdrop.findOneAndUpdate(
    { _id: airdrop._id, status: 'active', claimCount: { $lt: airdrop.maxClaims } },
    {
      $inc: { claimCount: 1 },
      $addToSet: { claimantIds: interaction.user.id },
    },
    { returnDocument: 'after' },
  );

  if (!updated) {
    return interaction.reply({ content: 'This airdrop is no longer available.', ephemeral: true });
  }

  if (updated.claimantIds[updated.claimantIds.length - 1] !== interaction.user.id) {
    return interaction.reply({ content: 'You have already claimed this airdrop.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let ticketChannel = null;
  try {
    ticketChannel = await createTicketChannel(interaction, updated);
  } catch (err) {
    logger.error(`Failed to create ticket for ${interaction.user.id}: ${err.message}`);
    const rolledBack = await Airdrop.findOneAndUpdate(
      { _id: updated._id, claimantIds: interaction.user.id },
      {
        $inc: { claimCount: -1 },
        $pull: { claimantIds: interaction.user.id },
      },
      { returnDocument: 'after' },
    );
    if (rolledBack) {
      await updatePublicEmbed(rolledBack);
    }
    return interaction.editReply({ content: `Failed to create your ticket channel: ${err.message}. Your claim has been rolled back.`, ephemeral: true });
  }

  updated.ticketChannelIds.push(ticketChannel.id);
  await updated.save();

  await updatePublicEmbed(updated);

  if (updated.claimCount >= updated.maxClaims) {
    updated.status = 'full';
    await updated.save();
    await updatePublicEmbed(updated);
    clearExpirationTimer(updated._id);
  }

  await sendTicketContent(interaction, updated, ticketChannel);

  return interaction.editReply({ content: `Your claim has been processed! A private ticket channel has been created: ${ticketChannel}`, ephemeral: true });
}

function sanitizeChannelName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || 'user';
}

async function createTicketChannel(interaction, airdrop) {
  const setup = await getSetup(interaction.guildId);
  const guild = interaction.guild;

  if (!setup.airdropTicketCategoryId) {
    throw new Error('No Airdrop ticket category is configured. An administrator must set one in `/setup` → Airdrop Settings.');
  }

  const category = guild.channels.cache.get(setup.airdropTicketCategoryId) || await guild.channels.fetch(setup.airdropTicketCategoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('The configured Airdrop ticket category no longer exists. An administrator must select a new one in `/setup`.');
  }

  const botMember = guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('I lack the "Manage Channels" permission required to create ticket channels.');
  }

  const baseName = `airdrop-${sanitizeChannelName(interaction.user.username)}`;
  let channelName = baseName;
  let suffix = 1;
  while (guild.channels.cache.find((c) => c.name === channelName && c.parentId === category.id)) {
    channelName = `${baseName}-${suffix}`;
    suffix++;
  }

  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: botMember.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  for (const staffUserId of setup.airdropTicketStaffUsers) {
    permissionOverwrites.push({
      id: staffUserId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  for (const staffRoleId of setup.airdropTicketStaffRoles) {
    const role = guild.roles.cache.get(staffRoleId);
    if (role) {
      permissionOverwrites.push({
        id: staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }
  }

  const adminRole = guild.roles.cache.find((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  if (adminRole) {
    permissionOverwrites.push({
      id: adminRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });

  return channel;
}

async function sendTicketContent(interaction, airdrop, ticketChannel) {
  const claimEmbed = new EmbedBuilder()
    .setTitle('🎁 Airdrop Claim')
    .setColor(0x00b06b)
    .addFields(
      { name: 'Claimant', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Username', value: interaction.user.tag, inline: true },
      { name: 'Prize', value: airdrop.prize, inline: false },
      { name: 'Airdrop ID', value: airdrop._id.toString(), inline: true },
      { name: 'Claim Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: 'Airdrop claim ticket' })
    .setTimestamp();

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('airdrop_ticket_close')
      .setLabel('🔒 Close (Delete)')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('airdrop_ticket_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [claimEmbed], components: [controlRow] });
}

async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  if (!channel) return;

  const setup = await getSetup(interaction.guildId);
  const member = interaction.member;

  const isAdmin = member.permissions && member.permissions.has(PermissionFlagsBits.Administrator);
  const isStaffUser = setup.airdropTicketStaffUsers.includes(interaction.user.id);
  const isStaffRole = setup.airdropTicketStaffRoles.some((rid) => member.roles && member.roles.cache.has(rid));

  if (!isAdmin && !isStaffUser && !isStaffRole) {
    const claimantOverwrite = channel.permissionOverwrites?.cache.get(interaction.user.id);
    if (!claimantOverwrite || !claimantOverwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
      return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
    }
  }

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('airdrop_ticket_close_confirm')
      .setLabel('Confirm Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('airdrop_ticket_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ content: 'Are you sure you want to delete this ticket channel? This action cannot be undone.', components: [confirmRow], ephemeral: true });
}

async function handleTicketCloseConfirm(interaction) {
  const channel = interaction.channel;
  if (!channel) {
    return interaction.reply({ content: 'Channel not found.', ephemeral: true });
  }

  try {
    await Airdrop.updateMany(
      { ticketChannelIds: channel.id },
      { $pull: { ticketChannelIds: channel.id } },
    );
  } catch (err) {
    logger.error(`Failed to remove ticket channel from airdrop records: ${err.message}`);
  }

  await interaction.update({ content: 'Deleting ticket channel...', components: [] });

  try {
    await channel.delete('Airdrop ticket closed');
  } catch (err) {
    logger.error(`Failed to delete ticket channel: ${err.message}`);
  }
}

async function handleTicketCancel(interaction) {
  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({ content: 'Action cancelled.', components: [] });
  }
  return interaction.reply({ content: 'Action cancelled.', ephemeral: true });
}

function scheduleExpiration(airdrop) {
  const id = String(airdrop._id);
  clearExpirationTimer(id);

  const ms = new Date(airdrop.expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    processExpiration(id);
    return;
  }

  const timer = setTimeout(() => processExpiration(id), ms);
  expirationTimers.set(id, timer);
}

function clearExpirationTimer(airdropId) {
  const id = String(airdropId);
  if (expirationTimers.has(id)) {
    clearTimeout(expirationTimers.get(id));
    expirationTimers.delete(id);
  }
}

async function processExpiration(airdropId) {
  const id = String(airdropId);
  clearExpirationTimer(id);

  try {
    const airdrop = await Airdrop.findById(id);
    if (!airdrop) return;

    if (airdrop.status !== 'active') return;

    const now = Date.now();
    if (now >= new Date(airdrop.expiresAt).getTime()) {
      airdrop.status = airdrop.claimCount >= airdrop.maxClaims ? 'full' : 'expired';
      await airdrop.save();
      await updatePublicEmbed(airdrop);
      logger.info(`Airdrop ${id} expired`);
    }
  } catch (err) {
    logger.error(`Failed to process expiration for airdrop ${id}: ${err.message}`);
  }
}

async function restoreAirdrops(client) {
  clientRef = client;
  const active = await Airdrop.find({ status: 'active' });
  for (const airdrop of active) {
    const now = Date.now();
    if (now >= new Date(airdrop.expiresAt).getTime()) {
      airdrop.status = airdrop.claimCount >= airdrop.maxClaims ? 'full' : 'expired';
      await airdrop.save();
      await updatePublicEmbed(airdrop);
    } else {
      scheduleExpiration(airdrop);
    }
  }
  logger.info(`Airdrop restore complete: ${active.length} active airdrops checked`);
}

module.exports = {
  setClient,
  canCreateAirdrop,
  getSetup,
  createAirdrop,
  handleClaim,
  handleTicketClose,
  handleTicketCloseConfirm,
  handleTicketCancel,
  scheduleExpiration,
  restoreAirdrops,
  updatePublicEmbed,
};
