const { EmbedBuilder } = require('discord.js');
const trackerManager = require('../tracker/trackerManager');
const robloxApi = require('../utils/robloxApi');
const logger = require('../utils/logger');

async function handleTrackStart(interaction) {
  if (!interaction.memberPermissions || !interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const username = interaction.options.getString('username');
  const milestone = interaction.options.getInteger('milestone');

  if (!username || username.length < 3 || username.length > 20) {
    return interaction.editReply('Invalid Roblox username (must be 3-20 characters).');
  }

  if (!milestone || milestone < 1) {
    return interaction.editReply('Milestone must be a positive number.');
  }

  if (trackerManager.isRunning()) {
    return interaction.editReply('A tracker is already active. Stop it first with `w! Track stop`.');
  }

  let userInfo;
  try {
    userInfo = await robloxApi.getUserIdFromUsername(username);
  } catch (err) {
    return interaction.editReply(`Roblox username lookup failed: ${err.message}`);
  }

  if (!userInfo) {
    return interaction.editReply(`Could not find a Roblox user named "${username}".`);
  }

  const setup = await trackerManager.getSetup(interaction.guildId);
  const pingIds = (setup.trackerPingIds || []).slice();

  const channelId = interaction.channelId;

  let result;
  try {
    result = await trackerManager.startTracker({
      guildId: interaction.guildId,
      robloxUsername: userInfo.username,
      robloxUserId: userInfo.id,
      milestone,
      channelId,
      pingIds,
    });
  } catch (err) {
    logger.error('startTracker error:', err.message);
    return interaction.editReply(`Failed to start tracker: ${err.message}`);
  }

  if (!result.success) {
    return interaction.editReply(result.reason);
  }

  const startCount = result.startCount || 0;
  const target = result.targetFollowers || (startCount + milestone);

  const embed = new EmbedBuilder()
    .setTitle('Roblox Follower Tracker')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'User', value: userInfo.username, inline: true },
      { name: 'Roblox ID', value: userInfo.id, inline: true },
      { name: 'Milestone', value: milestone.toLocaleString(), inline: true },
      { name: 'Starting Followers', value: startCount.toLocaleString(), inline: true },
      { name: 'Current Followers', value: startCount.toLocaleString(), inline: true },
      { name: 'Target', value: target.toLocaleString(), inline: true },
      { name: 'Followers Gained', value: `0 / ${milestone.toLocaleString()}`, inline: true },
      { name: 'Remaining', value: milestone.toLocaleString(), inline: true },
      { name: 'Progress', value: '0.0%', inline: true },
    )
    .setFooter({ text: 'Checking every 1 minute' })
    .setTimestamp();

  const trackerMessage = await interaction.channel.send({ embeds: [embed] });

  await trackerManager.setMessageId(result.trackerId, trackerMessage.id);

  return interaction.editReply({ content: 'Tracker started — the tracking embed has been posted in this channel and will update every minute.' });
}

async function handleTrackStop(ctx) {
  const isInteraction = !ctx.content;
  const hasAdmin = isInteraction
    ? ctx.memberPermissions && ctx.memberPermissions.has('Administrator')
    : ctx.member && ctx.member.permissions && ctx.member.permissions.has('Administrator');

  if (!hasAdmin) {
    if (isInteraction) {
      return ctx.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }
    return ctx.reply('You need Administrator permission to use this command.');
  }

  const stopped = await trackerManager.stopTracker();

  if (isInteraction) {
    if (ctx.deferred || ctx.replied) {
      return ctx.editReply(stopped ? 'Tracker stopped.' : 'No tracker is currently active.');
    }
    return ctx.reply({ content: stopped ? 'Tracker stopped.' : 'No tracker is currently active.', ephemeral: true });
  }

  return ctx.reply(stopped ? 'Tracker stopped.' : 'No tracker is currently active.');
}

module.exports = { handleTrackStart, handleTrackStop };
