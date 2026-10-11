const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const Appeal = require('../models/Appeal');
const Quarantine = require('../models/Quarantine');
const Setup = require('../models/Setup');
const logger = require('../utils/logger');

async function getSetup(guildId) {
  let setup = await Setup.findOne({ guildId });
  if (!setup) {
    setup = await Setup.create({ guildId });
  }
  return setup;
}

async function checkPermission(member, setup) {
  if (member.permissions && member.permissions.has('Administrator')) return true;
  if (setup.quarantineStaffRoleId && member.roles && member.roles.cache.has(setup.quarantineStaffRoleId)) return true;
  return false;
}

async function sendQuarantineDM(guild, target, reason, quarantineId) {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ You have been quarantined')
    .setColor(0xf1c40f)
    .setDescription(`You have been placed in quarantine in **${guild.name}**.`)
    .addFields(
      { name: 'Reason', value: reason, inline: false },
      { name: 'Appealing', value: 'If you believe this punishment was incorrect, you can submit an appeal by clicking the button below.', inline: false },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal:${quarantineId}`)
      .setLabel('Appeal')
      .setStyle(ButtonStyle.Primary),
  );

  try {
    await target.send({ embeds: [embed], components: [row] });
    return true;
  } catch (err) {
    logger.warn(`Could not DM ${target.id} for quarantine appeal: ${err.message}`);
    return false;
  }
}

async function showAppealModal(interaction, quarantineId) {
  const guild = interaction.guild;

  let quarantine;
  try {
    quarantine = await Quarantine.findById(quarantineId);
  } catch (err) {
    return interaction.reply({ content: 'Could not find the quarantine record. You may not be able to appeal this quarantine.', ephemeral: true });
  }

  if (!quarantine) {
    return interaction.reply({ content: 'That quarantine record no longer exists. You cannot appeal it.', ephemeral: true });
  }

  if (quarantine.userId !== interaction.user.id) {
    return interaction.reply({ content: 'Only the quarantined member can submit an appeal for their own quarantine.', ephemeral: true });
  }

  if (!quarantine.active) {
    return interaction.reply({ content: 'You are no longer quarantined, so you cannot appeal that quarantine.', ephemeral: true });
  }

  const existing = await Appeal.findOne({ guildId: guild.id, userId: interaction.user.id, status: 'pending' });
  if (existing) {
    return interaction.reply({ content: 'You already have a pending appeal. Please wait for staff to review it.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`appeal_modal:${quarantineId}`)
    .setTitle('Quarantine Appeal')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('appeal_explanation')
          .setLabel('Why should your quarantine be reviewed?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1000)
          .setPlaceholder('Explain why you believe the quarantine was incorrect or unfair.'),
      ),
    );

  return interaction.showModal(modal);
}

async function handleAppealModalSubmit(interaction, quarantineId) {
  const guild = interaction.guild;
  const appealReason = interaction.fields.getTextInputValue('appeal_explanation');

  if (!appealReason || appealReason.trim().length === 0) {
    return interaction.reply({ content: 'You must provide an explanation for your appeal.', ephemeral: true });
  }

  const setup = await getSetup(guild.id);

  if (!setup.appealChannelId) {
    return interaction.reply({ content: 'No appeal channel has been configured. An administrator needs to set one up via `/setup` → Mod Settings → Appeal Messages Channel.', ephemeral: true });
  }

  let quarantine;
  try {
    quarantine = await Quarantine.findById(quarantineId);
  } catch {
    quarantine = null;
  }

  if (!quarantine || !quarantine.active) {
    return interaction.reply({ content: 'You are no longer quarantined, so you cannot appeal that quarantine.', ephemeral: true });
  }

  const existing = await Appeal.findOne({ guildId: guild.id, userId: interaction.user.id, status: 'pending' });
  if (existing) {
    return interaction.reply({ content: 'You already have a pending appeal. Please wait for staff to review it.', ephemeral: true });
  }

  const appealChannel = guild.channels.cache.get(setup.appealChannelId) || await guild.channels.fetch(setup.appealChannelId).catch(() => null);
  if (!appealChannel) {
    return interaction.reply({ content: 'The configured appeal channel no longer exists. An administrator needs to reconfigure it via `/setup`.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Quarantine Appeal')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'Member', value: interaction.user.username, inline: true },
      { name: 'User ID', value: interaction.user.id, inline: true },
      { name: 'Quarantine Reason', value: quarantine.reason, inline: false },
      { name: 'Appeal Explanation', value: appealReason, inline: false },
      { name: 'Status', value: 'Pending', inline: false },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_approve:${quarantineId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`appeal_deny:${quarantineId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger),
  );

  let appealMessage;
  try {
    appealMessage = await appealChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.error(`Failed to send appeal to channel: ${err.message}`);
    return interaction.reply({ content: 'Failed to submit your appeal. Please try again later or contact a staff member.', ephemeral: true });
  }

  await Appeal.create({
    guildId: guild.id,
    userId: interaction.user.id,
    quarantineId: quarantine._id,
    quarantineReason: quarantine.reason,
    appealReason,
    status: 'pending',
    appealMessageId: appealMessage.id,
    appealChannelId: appealChannel.id,
  });

  return interaction.reply({ content: 'Your appeal has been submitted. Staff will review it and you will be notified of the decision.', ephemeral: true });
}

async function handleAppealApprove(interaction, quarantineId) {
  const guild = interaction.guild;
  const setup = await getSetup(guild.id);

  const allowed = await checkPermission(interaction.member, setup);
  if (!allowed) {
    return interaction.reply({ content: 'You do not have permission to review appeals. You need Administrator or the Quarantine Staff role.', ephemeral: true });
  }

  const appeal = await Appeal.findOne({ guildId: guild.id, quarantineId, status: 'pending' });
  if (!appeal) {
    return interaction.reply({ content: 'This appeal no longer exists or has already been processed.', ephemeral: true });
  }

  await interaction.deferUpdate().catch(() => {});

  appeal.status = 'approved';
  appeal.staffId = interaction.user.id;
  appeal.decidedAt = new Date();
  await appeal.save();

  let quarantine;
  try {
    quarantine = await Quarantine.findById(quarantineId);
  } catch {
    quarantine = null;
  }
  if (!quarantine || !quarantine.active) {
    await updateAppealMessage(guild, appeal, 'Approved', interaction.user);
    return interaction.followUp({ content: 'The member is no longer quarantined. Appeal marked as approved.', ephemeral: true });
  }

  const target = await guild.members.fetch(appeal.userId).catch(() => null);
  if (!target) {
    await updateAppealMessage(guild, appeal, 'Approved', interaction.user);
    return interaction.followUp({ content: 'The member has left the server. Appeal marked as approved, but roles could not be restored.', ephemeral: true });
  }

  const botHighest = guild.members.me.roles.highest;

  if (setup.quarantineRoleId) {
    const qRole = guild.roles.cache.get(setup.quarantineRoleId);
    if (qRole && qRole.editable && target.roles.cache.has(setup.quarantineRoleId)) {
      try {
        await target.roles.remove(setup.quarantineRoleId, `Appeal approved by ${interaction.user.tag}`);
      } catch (err) {
        logger.warn(`Could not remove quarantine role during appeal approval: ${err.message}`);
      }
    }
  }

  const rolesToRestore = [];
  for (const roleId of quarantine.previousRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    if (!role.editable || role.position >= botHighest.position) continue;
    if (target.roles.cache.has(roleId)) continue;
    rolesToRestore.push(roleId);
  }

  if (rolesToRestore.length > 0) {
    try {
      await target.roles.add(rolesToRestore, `Appeal approved by ${interaction.user.tag}`);
    } catch (err) {
      logger.error(`Failed to restore roles during appeal approval: ${err.message}`);
    }
  }

  quarantine.active = false;
  await quarantine.save();

  await dmMember(guild, appeal.userId, '✅ Appeal Approved', `Your quarantine appeal in **${guild.name}** has been **approved**. Your previous roles have been restored.`);

  await updateAppealMessage(guild, appeal, 'Approved', interaction.user);

  return interaction.followUp({ content: 'Appeal approved. The quarantine role has been removed and previous roles restored.', ephemeral: true });
}

async function showDenyModal(interaction, quarantineId) {
  const guild = interaction.guild;
  const setup = await getSetup(guild.id);

  const allowed = await checkPermission(interaction.member, setup);
  if (!allowed) {
    return interaction.reply({ content: 'You do not have permission to review appeals. You need Administrator or the Quarantine Staff role.', ephemeral: true });
  }

  const appeal = await Appeal.findOne({ guildId: guild.id, quarantineId, status: 'pending' });
  if (!appeal) {
    return interaction.reply({ content: 'This appeal no longer exists or has already been processed.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`appeal_deny_modal:${quarantineId}`)
    .setTitle('Deny Appeal')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('deny_reason')
          .setLabel('Why is this appeal being denied?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(500)
          .setPlaceholder('Provide a reason for denying this appeal.'),
      ),
    );

  return interaction.showModal(modal);
}

async function handleAppealDenyModalSubmit(interaction, quarantineId) {
  const guild = interaction.guild;
  const setup = await getSetup(guild.id);

  const allowed = await checkPermission(interaction.member, setup);
  if (!allowed) {
    return interaction.reply({ content: 'You do not have permission to review appeals.', ephemeral: true });
  }

  const denyReason = interaction.fields.getTextInputValue('deny_reason');
  if (!denyReason || denyReason.trim().length === 0) {
    return interaction.reply({ content: 'You must provide a reason for denying the appeal.', ephemeral: true });
  }

  const appeal = await Appeal.findOne({ guildId: guild.id, quarantineId, status: 'pending' });
  if (!appeal) {
    return interaction.reply({ content: 'This appeal no longer exists or has already been processed.', ephemeral: true });
  }

  appeal.status = 'denied';
  appeal.staffId = interaction.user.id;
  appeal.denyReason = denyReason.trim();
  appeal.decidedAt = new Date();
  await appeal.save();

  await dmMember(guild, appeal.userId, '❌ Appeal Denied', `Your quarantine appeal in **${guild.name}** has been **denied**.\n\n**Reason:** ${denyReason.trim()}`);

  await updateAppealMessage(guild, appeal, 'Denied', interaction.user);

  return interaction.reply({ content: 'Appeal denied. The member has been notified.', ephemeral: true });
}

async function updateAppealMessage(guild, appeal, decision, staff) {
  try {
    const channel = guild.channels.cache.get(appeal.appealChannelId) || await guild.channels.fetch(appeal.appealChannelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(appeal.appealMessageId).catch(() => null);
    if (!message) return;

    const member = await guild.members.fetch(appeal.userId).catch(() => null);
    const displayName = member ? member.user.username : appeal.userId;

    const embed = new EmbedBuilder()
      .setTitle('📋 Quarantine Appeal')
      .setColor(decision === 'Approved' ? 0x2ecc71 : 0xe74c3c)
      .addFields(
        { name: 'Member', value: displayName, inline: true },
        { name: 'User ID', value: appeal.userId, inline: true },
        { name: 'Quarantine Reason', value: appeal.quarantineReason, inline: false },
        { name: 'Appeal Explanation', value: appeal.appealReason, inline: false },
        { name: 'Status', value: decision, inline: false },
        { name: 'Reviewed By', value: staff.username, inline: true },
      )
      .setTimestamp();

    if (decision === 'Denied' && appeal.denyReason) {
      embed.addFields({ name: 'Denial Reason', value: appeal.denyReason, inline: false });
    }

    await message.edit({ embeds: [embed], components: [] });
  } catch (err) {
    logger.warn(`Could not update appeal message: ${err.message}`);
  }
}

async function dmMember(guild, userId, title, description) {
  try {
    const user = await guild.client.users.fetch(userId);
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x2b2d31)
      .setDescription(description)
      .setTimestamp();
    await user.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Could not DM user ${userId}: ${err.message}`);
  }
}

module.exports = {
  sendQuarantineDM,
  showAppealModal,
  handleAppealModalSubmit,
  handleAppealApprove,
  showDenyModal,
  handleAppealDenyModalSubmit,
};
