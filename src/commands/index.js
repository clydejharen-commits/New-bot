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
;

const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Open the bot setup dashboard');

const quarantineCommand = new SlashCommandBuilder()
  .setName('quarantine')
  .setDescription('Quarantine a member by removing their roles and assigning the quarantine role')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The member to quarantine').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for quarantining').setRequired(true),
  );

const unquarantineCommand = new SlashCommandBuilder()
  .setName('unquarantine')
  .setDescription('Remove a member from quarantine and restore their previous roles')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The member to unquarantine').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for unquarantining').setRequired(true),
  );

const tagCommand = new SlashCommandBuilder()
  .setName('tag')
  .setDescription('Server Tag verification')
  .addSubcommand((sub) =>
    sub
      .setName('verify')
      .setDescription('Check if you are wearing this server\'s Server Tag'),
  );

const commands = [trackCommand.toJSON(), setupCommand.toJSON(), quarantineCommand.toJSON(), unquarantineCommand.toJSON(), tagCommand.toJSON()];

module.exports = { commands };
