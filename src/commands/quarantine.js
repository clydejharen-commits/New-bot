const { EmbedBuilder } = require('discord.js');
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
  if (member.permissions && member.permissions.has('Administrator')) {
    return true;
  }
  if (setup.quarantineStaffRoleId && member.roles && member.roles.cache.has(setup.quarantineStaffRoleId)) {
    return true;
  }
  return false;
}

async function resolveTarget(guild, userRef) {
  let member;
  try {
    member = await guild.members.fetch(userRef);
  } catch {
    return null;
  }
  return member;
}

async function handleQuarantine(ctx) {
  const isInteraction = !ctx.content;
  const guild = ctx.guild;

  const userRef = isInteraction ? ctx.options.getUser('user').id : ctx.mentions.users.first()?.id;
  const reason = isInteraction ? ctx.options.getString('reason') : ctx.args.slice(1).join(' ');

  if (!userRef) {
    return ctx.respond('You must specify a user to quarantine.');
  }
  if (!reason) {
    return ctx.respond('You must provide a reason for quarantining.');
  }

  const setup = await getSetup(guild.id);

  const member = isInteraction ? ctx.member : ctx.member;
  const allowed = await checkPermission(member, setup);
  if (!allowed) {
    return ctx.respond('You do not have permission to use this command. You need Administrator or the Quarantine Staff role.');
  }

  if (!setup.quarantineRoleId) {
    return ctx.respond('Quarantine Role is not configured. Use `/setup` to configure it first.');
  }

  await ctx.acknowledge();

  const target = await resolveTarget(guild, userRef);
  if (!target) {
    return ctx.followUp('That user is not a member of this server.');
  }

  const quarantineRole = guild.roles.cache.get(setup.quarantineRoleId) || await guild.roles.fetch(setup.quarantineRoleId).catch(() => null);
  if (!quarantineRole) {
    return ctx.followUp('The configured Quarantine Role no longer exists.');
  }

  if (!quarantineRole.editable) {
    return ctx.followUp('I cannot manage the Quarantine Role. It is above my highest role or I lack permissions.');
  }

  const existing = await Quarantine.findOne({ guildId: guild.id, userId: target.id, active: true });
  if (existing) {
    return ctx.followUp('That member is already quarantined.');
  }

  const botHighest = guild.members.me.roles.highest;
  const previousRoleIds = target.roles.cache
    .filter((r) => r.id !== guild.id && r.id !== setup.quarantineRoleId && r.position < botHighest.position && r.editable)
    .map((r) => r.id);

  try {
    const rolesToRemove = target.roles.cache
      .filter((r) => r.id !== guild.id && r.editable && r.position < botHighest.position)
      .map((r) => r.id);

    if (rolesToRemove.length > 0) {
      await target.roles.remove(rolesToRemove, `Quarantined by ${ctx.author?.tag || ctx.author?.username || 'unknown'}: ${reason}`);
    }

    await target.roles.add(setup.quarantineRoleId, `Quarantined by ${ctx.author?.tag || ctx.author?.username || 'unknown'}: ${reason}`);
  } catch (err) {
    logger.error('Failed to modify roles during quarantine:', err.message);
    return ctx.followUp(`Failed to quarantine that member: ${err.message}`);
  }

  await Quarantine.create({
    guildId: guild.id,
    userId: target.id,
    previousRoleIds,
    staffId: ctx.author.id,
    reason,
    active: true,
  });

  await sendQuarantineLog(guild, setup, target, ctx.author, reason);

  const embed = new EmbedBuilder()
    .setTitle('Member Quarantined')
    .setColor(0xf1c40f)
    .addFields(
      { name: 'Member', value: `<@${target.id}>`, inline: true },
      { name: 'Staff', value: `<@${ctx.author.id}>`, inline: true },
      { name: 'Reason', value: reason, inline: false },
    )
    .setFooter({ text: 'Previous roles have been saved and will be restored on unquarantine' })
    .setTimestamp();

  return ctx.followUp({ embeds: [embed] });
}

async function handleUnquarantine(ctx) {
  const isInteraction = !ctx.content;
  const guild = ctx.guild;

  const userRef = isInteraction ? ctx.options.getUser('user').id : ctx.mentions.users.first()?.id;
  const reason = isInteraction ? ctx.options.getString('reason') : ctx.args.slice(1).join(' ');

  if (!userRef) {
    return ctx.respond('You must specify a user to unquarantine.');
  }
  if (!reason) {
    return ctx.respond('You must provide a reason for unquarantining.');
  }

  const setup = await getSetup(guild.id);

  const member = isInteraction ? ctx.member : ctx.member;
  const allowed = await checkPermission(member, setup);
  if (!allowed) {
    return ctx.respond('You do not have permission to use this command. You need Administrator or the Quarantine Staff role.');
  }

  await ctx.acknowledge();

  const record = await Quarantine.findOne({ guildId: guild.id, userId: userRef, active: true });
  if (!record) {
    return ctx.followUp('That member does not have an active quarantine record.');
  }

  const target = await resolveTarget(guild, userRef);
  if (!target) {
    return ctx.followUp('That user is no longer in the server. Their quarantine record has been cleared.');
  }

  const botHighest = guild.members.me.roles.highest;

  if (setup.quarantineRoleId) {
    const qRole = guild.roles.cache.get(setup.quarantineRoleId);
    if (qRole && qRole.editable && target.roles.cache.has(setup.quarantineRoleId)) {
      try {
        await target.roles.remove(setup.quarantineRoleId, `Unquarantined by ${ctx.author?.tag || ctx.author?.username || 'unknown'}: ${reason}`);
      } catch (err) {
        logger.warn(`Could not remove quarantine role from ${target.id}: ${err.message}`);
      }
    }
  }

  const rolesToRestore = [];
  for (const roleId of record.previousRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    if (!role.editable || role.position >= botHighest.position) continue;
    rolesToRestore.push(roleId);
  }

  if (rolesToRestore.length > 0) {
    try {
      await target.roles.add(rolesToRestore, `Unquarantined by ${ctx.author?.tag || ctx.author?.username || 'unknown'}: ${reason}`);
    } catch (err) {
      logger.error('Failed to restore roles during unquarantine:', err.message);
      return ctx.followUp(`Removed quarantine role but failed to restore all previous roles: ${err.message}`);
    }
  }

  record.active = false;
  await record.save();

  await sendUnquarantineLog(guild, setup, target, ctx.author, reason);

  const embed = new EmbedBuilder()
    .setTitle('Member Unquarantined')
    .setColor(0x2ecc71)
    .addFields(
      { name: 'Member', value: `<@${target.id}>`, inline: true },
      { name: 'Staff', value: `<@${ctx.author.id}>`, inline: true },
      { name: 'Reason', value: reason, inline: false },
    )
    .setFooter({ text: 'Previous roles have been restored' })
    .setTimestamp();

  return ctx.followUp({ embeds: [embed] });
}

async function sendQuarantineLog(guild, setup, target, staff, reason) {
  if (!setup.quarantineLogChannelId) return;
  try {
    const channel = guild.channels.cache.get(setup.quarantineLogChannelId) || await guild.channels.fetch(setup.quarantineLogChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Member Quarantined')
      .setColor(0xf1c40f)
      .addFields(
        { name: 'Member', value: `<@${target.id}>`, inline: true },
        { name: 'Staff', value: `<@${staff.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setDescription('The member has been placed in quarantine and their previous roles have been saved.')
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Failed to send quarantine log: ${err.message}`);
  }
}

async function sendUnquarantineLog(guild, setup, target, staff, reason) {
  if (!setup.quarantineLogChannelId) return;
  try {
    const channel = guild.channels.cache.get(setup.quarantineLogChannelId) || await guild.channels.fetch(setup.quarantineLogChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔓 Member Unquarantined')
      .setColor(0x2ecc71)
      .addFields(
        { name: 'Member', value: `<@${target.id}>`, inline: true },
        { name: 'Staff', value: `<@${staff.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setDescription("The member's previous roles have been restored.")
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Failed to send unquarantine log: ${err.message}`);
  }
}

module.exports = { handleQuarantine, handleUnquarantine, checkPermission, getSetup };
