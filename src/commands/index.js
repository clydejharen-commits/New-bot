const { SlashCommandBuilder } = require('discord.js');

const trackCommand = new SlashCommandBuilder()
  .setName('track')
  .setDescription('Roblox Followers Tracking System')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Start tracking a Roblox user\'s followers')
      .addStringOption((opt) =>
        opt.setName('username').setDescription('Roblox username').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt.setName('milestone').setDescription('Follower milestone to notify at').setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('stop').setDescription('Stop the active tracker'),
  );

const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Open the bot setup dashboard');

const commands = [trackCommand.toJSON(), setupCommand.toJSON()];

module.exports = { commands };
