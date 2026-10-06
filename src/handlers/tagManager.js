const Setup = require('../models/Setup');
const logger = require('../utils/logger');

const BATCH_DELAY = 1000;

function hasServerTag(user, guildId) {
  if (!user || !user.primaryGuild) return false;
  const pg = user.primaryGuild;
  return pg.identityEnabled === true && pg.identityGuildId === guildId;
}

async function getTagConfig(guildId) {
  const setup = await Setup.findOne({ guildId });
  if (!setup || !setup.tagRoleEnabled || !setup.tagRoleId) return null;
  return { roleId: setup.tagRoleId, enabled: setup.tagRoleEnabled };
}

async function syncMemberTag(member) {
  try {
    const config = await getTagConfig(member.guild.id);
    if (!config) return;

    const role = member.guild.roles.cache.get(config.roleId);
    if (!role) {
      logger.warn(`Tag role ${config.roleId} not found in guild ${member.guild.id}`);
      return;
    }

    if (role.position >= member.guild.members.me.roles.highest.position) {
      logger.warn(`Tag role ${config.roleId} is above bot's highest role in guild ${member.guild.id}`);
      return;
    }

    const wearing = hasServerTag(member.user, member.guild.id);
    const hasRole = member.roles.cache.has(config.roleId);

    if (wearing && !hasRole) {
      await member.roles.add(config.roleId).catch((err) => {
        logger.error(`Failed to add tag role to ${member.user.tag}: ${err.message}`);
      });
    } else if (!wearing && hasRole) {
      await member.roles.remove(config.roleId).catch((err) => {
        logger.error(`Failed to remove tag role from ${member.user.tag}: ${err.message}`);
      });
    }
  } catch (err) {
    logger.error(`syncMemberTag error for ${member.id}: ${err.message}`);
  }
}

async function syncMemberByUserId(client, guildId, userId) {
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await syncMemberTag(member);
  } catch (err) {
    logger.error(`syncMemberByUserId error for ${userId}: ${err.message}`);
  }
}

async function checkAllMembers(client) {
  const guilds = client.guilds.cache;
  for (const [guildId, guild] of guilds) {
    const config = await getTagConfig(guildId).catch(() => null);
    if (!config) continue;

    try {
      const members = await guild.members.fetch({ withPresences: false });
      let checked = 0;
      for (const [memberId, member] of members) {
        if (member.user.bot) continue;
        await syncMemberTag(member);
        checked++;
        if (checked % 10 === 0) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY));
        }
      }
      logger.info(`Tag role check complete for guild ${guildId}: ${checked} members checked`);
    } catch (err) {
      logger.error(`Failed to check all members in guild ${guildId}: ${err.message}`);
    }
  }
}

async function handleUserUpdate(client, oldUser, newUser) {
  const oldPg = oldUser.primaryGuild;
  const newPg = newUser.primaryGuild;

  const oldGuildId = oldPg && oldPg.identityEnabled ? oldPg.identityGuildId : null;
  const newGuildId = newPg && newPg.identityEnabled ? newPg.identityGuildId : null;

  if (oldGuildId === newGuildId) return;

  const affectedGuildIds = new Set();
  if (oldGuildId) affectedGuildIds.add(oldGuildId);
  if (newGuildId) affectedGuildIds.add(newGuildId);

  for (const guildId of affectedGuildIds) {
    await syncMemberByUserId(client, guildId, newUser.id);
  }
}

async function handleGuildMemberAdd(member) {
  if (member.user.bot) return;
  await syncMemberTag(member);
}

async function handleVerify(interaction) {
  const config = await getTagConfig(interaction.guildId);

  if (!config) {
    return interaction.reply({ content: '⚠️ The Server Tag role has not been configured yet.', ephemeral: true });
  }

  const member = interaction.member;
  const wearing = hasServerTag(member.user, interaction.guildId);
  const hasRole = member.roles.cache.has(config.roleId);

  const role = interaction.guild.roles.cache.get(config.roleId);
  if (!role) {
    return interaction.reply({ content: '⚠️ The configured Server Tag role no longer exists.', ephemeral: true });
  }

  if (wearing && !hasRole) {
    await member.roles.add(config.roleId).catch((err) => {
      logger.error(`Verify: failed to add tag role to ${member.user.tag}: ${err.message}`);
    });
  } else if (!wearing && hasRole) {
    await member.roles.remove(config.roleId).catch((err) => {
      logger.error(`Verify: failed to remove tag role from ${member.user.tag}: ${err.message}`);
    });
  }

  if (wearing) {
    return interaction.reply({ content: '✅ You are wearing our Server Tag. Your role has been assigned.', ephemeral: true });
  }
  return interaction.reply({ content: '❌ You are not wearing our Server Tag.', ephemeral: true });
}

module.exports = {
  hasServerTag,
  getTagConfig,
  syncMemberTag,
  syncMemberByUserId,
  checkAllMembers,
  handleUserUpdate,
  handleGuildMemberAdd,
  handleVerify,
};
