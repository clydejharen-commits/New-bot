const Tracker = require('../models/Tracker');
const Setup = require('../models/Setup');
const robloxApi = require('../utils/robloxApi');
const logger = require('../utils/logger');

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

  if (!tracker.milestoneReached && count >= tracker.milestone) {
    tracker.milestoneReached = true;
    await tracker.save();
    await sendMilestoneNotification(tracker, count);
    stopInterval();
    await Tracker.updateOne({ _id: tracker._id }, { active: false });
  }
}

async function sendMilestoneNotification(tracker, count) {
  try {
    const guild = await clientRef.guilds.fetch(tracker.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(tracker.channelId) || await guild.channels.fetch(tracker.channelId).catch(() => null);
    if (!channel) {
      logger.warn(`Milestone channel ${tracker.channelId} not found`);
      return;
    }

    const rates = calculateRates(tracker.dataPoints, count, tracker.startedFollowers, tracker.startedAt);

    const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

    const pingContent = formatPingContent(tracker.pingIds);

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('Roblox Follower Milestone Reached!')
      .setColor(0x00b06b)
      .addFields(
        { name: 'User', value: tracker.robloxUsername, inline: true },
        { name: 'Current Followers', value: fmt(count), inline: true },
        { name: 'Milestone', value: fmt(tracker.milestone), inline: true },
        { name: 'Followers / min', value: fmt(rates.perMinute), inline: true },
        { name: 'Followers / hour', value: fmt(rates.perHour), inline: true },
        { name: 'Followers / day', value: fmt(rates.perDay), inline: true },
        { name: 'Tracked for', value: `${rates.elapsedMin.toFixed(1)} min`, inline: true },
      )
      .setFooter({ text: 'Tracker stopped automatically' })
      .setTimestamp();

    await channel.send({ content: pingContent || undefined, embeds: [embed] });
    logger.info(`Milestone reached for ${tracker.robloxUsername} at ${count} followers`);
  } catch (err) {
    logger.error('Failed to send milestone notification:', err.message);
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

  const tracker = await Tracker.create({
    guildId,
    robloxUsername,
    robloxUserId,
    milestone,
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
  return { success: true, tracker, startCount };
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
    logger.info(`Restoring active tracker for ${active.robloxUsername}`);
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
};
