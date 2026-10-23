const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

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

const afkCommand = new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Set your AFK status')
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Why you are going AFK').setRequired(false),
  );

const embedCommand = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Build and send a custom embed with an interactive builder')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('Destination channel (defaults to current channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('text').setDescription('Main embed text').setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('color').setDescription('HEX color, e.g. #5865F2').setRequired(false).setMaxLength(7),
  )
  .addStringOption((opt) =>
    opt.setName('footer').setDescription('Footer text').setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('footer_icon').setDescription('Footer icon URL').setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('thumbnail').setDescription('Small embed image URL').setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('image').setDescription('Large embed image URL').setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt.setName('timestamp').setDescription('Include current timestamp').setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName('webhook')
      .setDescription('Delivery method')
      .setRequired(false)
      .addChoices(
        { name: 'Bot Message', value: 'bot' },
        { name: 'Webhook', value: 'webhook' },
      ),
  )
  .addStringOption((opt) =>
    opt.setName('webhook_url').setDescription('Discord webhook URL (required if Webhook delivery is selected)').setRequired(false),
  );

const commands = [trackCommand.toJSON(), setupCommand.toJSON(), quarantineCommand.toJSON(), unquarantineCommand.toJSON(), tagCommand.toJSON(), afkCommand.toJSON(), embedCommand.toJSON()];

module.exports = { commands };
