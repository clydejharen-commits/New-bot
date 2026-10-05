const Tracker = require('../models/Tracker');
const Setup = require('../models/Setup');
const robloxApi = require('../utils/robloxApi');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

let interval = null;
let clientRef = null;

function formatPingContent(pingIds) {
  if (!pingIds || pingIds.length === 0) return '';
  return pingIds.map((id) => {
    if (id.startsWith('role:')) return `<@&${id.slice(5)}>`;
    return `<@${id}>`;
  }).join(' ');
}

function setClient(client) {
  clientRef = client;
}

function isRunning() {
  return interval !== null;
}

async function getActiveTracker() {
  return Tracker.findOne({ active: true });
}

async function getSetup(guildId) {
  let setup = await Setup.findOne({ guildId });
  if (!setup) {
    setup = await Setup.create({ guildId });
  }
  return setup;
}

function calculateRates(dataPoints, latestFollowers, startedFollowers, startedAt) {
  const now = new Date();
  const startTs = new Date(startedAt).getTime();
  const elapsedMs = Math.max(now.getTime() - startTs, 1);
  const elapsedMin = elapsedMs / 60000;
  const delta = Math.max(latestFollowers - startedFollowers, 0);

  if (elapsedMin <= 0 || dataPoints.length < 2) {
    return { perMinute: 0, perHour: 0, perDay: 0, elapsedMin: 0 };
  }

  const perMinute = delta / elapsedMin;
  const perHour = perMinute * 60;
  const perDay = perHour * 24;

  return { perMinute, perHour, perDay, elapsedMin };
}

function buildProgressEmbed(tracker, currentFollowers) {
  const gained = Math.max(currentFollowers - tracker.startedFollowers, 0);
  const target = tracker.targetFollowers;
  const milestone = tracker.milestone;
  const remaining = Math.max(target - currentFollowers, 0);
  const pct = milestone > 0 ? Math.min((gained / milestone) * 100, 100) : 0;

  const rates = calculateRates(tracker.dataPoints, currentFollowers, tracker.startedFollowers, tracker.startedAt);
  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

  return new EmbedBuilder()
    .setTitle('Roblox Follower Tracker')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'User', value: tracker.robloxUsername, inline: true },
      { name: 'Roblox ID', value: tracker.robloxUserId, inline: true },
      { name: 'Milestone', value: fmt(milestone), inline: true },
      { name: 'Starting Followers', value: fmt(tracker.startedFollowers), inline: true },
      { name: 'Current Followers', value: fmt(currentFollowers), inline: true },
      { name: 'Target', value: fmt(target), inline: true },
      { name: 'Followers Gained', value: `${fmt(gained)} / ${fmt(milestone)}`, inline: true },
      { name: 'Remaining', value: fmt(remaining), inline: true },
      { name: 'Progress', value: `${pct.toFixed(1)}%`, inline: true },
      { name: 'Followers / min', value: fmt(rates.perMinute), inline: true },
      { name: 'Followers / hour', value: fmt(rates.perHour), inline: true },
      { name: 'Tracked for', value: `${rates.elapsedMin.toFixed(1)} min`, inline: true },
    )
    .setFooter({ text: 'Checking every 1 minute' })
    .setTimestamp();
}

function buildCompletedEmbed(tracker, currentFollowers) {
  const gained = Math.max(currentFollowers - tracker.startedFollowers, 0);
  const target = tracker.targetFollowers;
  const milestone = tracker.milestone;
  const rates = calculateRates(tracker.dataPoints, currentFollowers, tracker.startedFollowers, tracker.startedAt);
  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

  return new EmbedBuilder()
    .setTitle('Roblox Follower Milestone Reached!')
    .setColor(0x00b06b)
    .addFields(
      { name: 'User', value: tracker.robloxUsername, inline: true },
      { name: 'Roblox ID', value: tracker.robloxUserId, inline: true },
      { name: 'Milestone', value: fmt(milestone), inline: true },
      { name: 'Starting Followers', value: fmt(tracker.startedFollowers), inline: true },
      { name: 'Current Followers', value: fmt(currentFollowers), inline: true },
      { name: 'Target', value: fmt(target), inline: true },
      { name: 'Followers Gained', value: `${fmt(gained)} / ${fmt(milestone)}`, inline: true },
      { name: 'Followers / min', value: fmt(rates.perMinute), inline: true },
      { name: 'Tracked for', value: `${rates.elapsedMin.toFixed(1)} min`, inline: true },
    )
    .setFooter({ text: 'Tracker stopped automatically — milestone reached' })
    .setTimestamp();
}

async function fetchTrackingMessage(tracker) {
  if (!clientRef || !tracker.messageId || !tracker.channelId) return null;
  try {
    const guild = await clientRef.guilds.fetch(tracker.guildId);
    if (!guild) return null;
    const channel = guild.channels.cache.get(tracker.channelId) || await guild.channels.fetch(tracker.channelId).catch(() => null);
    if (!channel) return null;
    const message = await channel.messages.fetch(tracker.messageId).catch(() => null);
    return message || null;
  } catch (err) {
    logger.error('Failed to fetch tracking message:', err.message);
    return null;
  }
}

async function checkOnce() {
  let tracker;
  try {
    tracker = await Tracker.findOne({ active: true });
    if (!tracker) {
      stopInterval();
      return;
    }
  } catch (err) {
    logger.error('Tracker DB error during check:', err.message);
    return;
  }

  let count;
  try {
    count = await robloxApi.getFollowerCount(tracker.robloxUserId);
  } catch (err) {
    logger.warn(`Roblox API failure for ${tracker.robloxUsername}: ${err.message} — will retry next interval`);
    return;
  }

  const now = new Date();
  tracker.lastFollowers = count;
  tracker.lastCheckAt = now;
  tracker.dataPoints.push({ t: now, f: count });

  if (tracker.dataPoints.length > 1440) {
    tracker.dataPoints = tracker.dataPoints.slice(-1440);
  }

  await tracker.save();

  const target = tracker.targetFollowers;

  if (!tracker.milestoneReached && count >= target) {
    tracker.milestoneReached = true;
    await tracker.save();

    const embed = buildCompletedEmbed(tracker, count);
    const message = await fetchTrackingMessage(tracker);
    if (message) {
      const pingContent = formatPingContent(tracker.pingIds);
      await message.edit({ content: pingContent || undefined, embeds: [embed] }).catch((err) => {
        logger.error('Failed to edit tracking message on completion:', err.message);
      });
    } else {
      try {
        const guild = await clientRef.guilds.fetch(tracker.guildId);
        const channel = guild.channels.cache.get(tracker.channelId) || await guild.channels.fetch(tracker.channelId).catch(() => null);
        if (channel) {
          const pingContent = formatPingContent(tracker.pingIds);
          await channel.send({ content: pingContent || undefined, embeds: [embed] });
        }
      } catch (err) {
        logger.error('Failed to send completion notification:', err.message);
      }
    }

    logger.info(`Milestone reached for ${tracker.robloxUsername} at ${count} followers (target: ${target})`);
    stopInterval();
    await Tracker.updateOne({ _id: tracker._id }, { active: false });
    return;
  }

  const embed = buildProgressEmbed(tracker, count);
  const message = await fetchTrackingMessage(tracker);
  if (message) {
    await message.edit({ embeds: [embed] }).catch((err) => {
      logger.error('Failed to edit tracking message:', err.message);
    });
  } else {
    logger.warn(`Tracking message ${tracker.messageId} not found — cannot update embed`);
  }
}

function startInterval() {
  if (interval) return;
  interval = setInterval(async () => {
    try {
      await checkOnce();
    } catch (err) {
      logger.error('Unexpected tracker check error:', err.message);
    }
  }, 60 * 1000);
  logger.info('Tracker interval started (60s)');
}

function stopInterval() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('Tracker interval stopped');
  }
}

async function startTracker({ guildId, robloxUsername, robloxUserId, milestone, channelId, pingIds }) {
  const existing = await Tracker.findOne({ active: true });
  if (existing) {
    return { success: false, reason: 'A tracker is already active. Stop it first with `w! Track stop`.' };
  }

  const count = await robloxApi.getFollowerCount(robloxUserId).catch(() => null);
  const startCount = typeof count === 'number' ? count : 0;
  const targetFollowers = startCount + milestone;

  const tracker = await Tracker.create({
    guildId,
    robloxUsername,
    robloxUserId,
    milestone,
    targetFollowers,
    messageId: null,
    channelId,
    pingIds,
    active: true,
    milestoneReached: false,
    startedAt: new Date(),
    startedFollowers: startCount,
    lastFollowers: startCount,
    lastCheckAt: new Date(),
    dataPoints: [{ t: new Date(), f: startCount }],
  });

  startInterval();
  return { success: true, trackerId: tracker._id, startCount, targetFollowers };
}

async function setMessageId(trackerId, messageId) {
  await Tracker.updateOne({ _id: trackerId }, { messageId });
}

async function stopTracker() {
  stopInterval();
  const result = await Tracker.updateMany({ active: true }, { active: false });
  return result.modifiedCount > 0;
}

async function restoreTracker(client) {
  clientRef = client;
  const active = await Tracker.findOne({ active: true, milestoneReached: false });
  if (active) {
    logger.info(`Restoring active tracker for ${active.robloxUsername} (target: ${active.targetFollowers})`);
    startInterval();
  } else {
    await Tracker.updateMany({ active: true, milestoneReached: true }, { active: false });
  }
}

module.exports = {
  setClient,
  isRunning,
  getActiveTracker,
  getSetup,
  calculateRates,
  startTracker,
  stopTracker,
  restoreTracker,
  startInterval,
  stopInterval,
  setMessageId,
};
