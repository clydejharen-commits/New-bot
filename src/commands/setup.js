const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelSelectMenuBuilder,
} = require('discord.js');
const Setup = require('../models/Setup');

async function getSetup(guildId) {
  let setup = await Setup.findOne({ guildId });
  if (!setup) {
    setup = await Setup.create({ guildId });
  }
  return setup;
}

async function handleSetup(interaction) {
  if (!interaction.memberPermissions || !interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle('Bot Setup Dashboard')
    .setColor(0x2b2d31)
    .setDescription('Configure the bot below.');

  const trackerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tracker_settings')
      .setLabel('⚙️ Tracker Settings')
      .setStyle(ButtonStyle.Primary),
  );

  const modRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mod_settings')
      .setLabel('🛡️ Mod Settings')
      .setStyle(ButtonStyle.Secondary),
  );

  const tagRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tag_settings')
      .setLabel('🏷️ Auto Tag Role')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.editReply({ embeds: [embed], components: [trackerRow, modRow, tagRow] });
}

async function openTrackerSettings(interaction) {
  const setup = await getSetup(interaction.guildId);

  const pingDisplay = setup.trackerPingIds && setup.trackerPingIds.length > 0
    ? setup.trackerPingIds.map((id) => {
        if (id.startsWith('role:')) return `<@&${id.slice(5)}>`;
        return `<@${id}>`;
      }).join(' ')
    : 'Not set';

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Tracker Settings')
    .setColor(0x2b2d31)
    .setDescription(
      'Select the users and/or roles to ping when the milestone is reached.\n' +
      'You can search and select multiple users and roles.\n\n' +
      '⚠️ Disclaimer: The tracking embed is only sent to the channel where the command is executed, so it will not always send to the same channel.',
    )
    .addFields(
      {
        name: 'Current Ping Targets',
        value: pingDisplay,
        inline: false,
      },
    );

  const pingMenu = new MentionableSelectMenuBuilder()
    .setCustomId('tracker_ping_menu')
    .setPlaceholder('Select users and/or roles to ping on milestone')
    .setMinValues(0)
    .setMaxValues(25);

  const row1 = new ActionRowBuilder().addComponents(pingMenu);

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup_back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row1, backButton] });
}

async function openModSettings(interaction) {
  const setup = await getSetup(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle('Mod Settings')
    .setColor(0x2b2d31)
    .setDescription('Configure the Quarantine System below.')
    .addFields(
      {
        name: 'Quarantine Staff',
        value: setup.quarantineStaffRoleId ? `<@&${setup.quarantineStaffRoleId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Quarantine Logs',
        value: setup.quarantineLogChannelId ? `<#${setup.quarantineLogChannelId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Quarantine Role',
        value: setup.quarantineRoleId ? `<@&${setup.quarantineRoleId}>` : 'Not set',
        inline: true,
      },
    );

  const staffMenu = new RoleSelectMenuBuilder()
    .setCustomId('mod_quarantine_staff')
    .setPlaceholder('Select Quarantine Staff role');

  const logMenu = new ChannelSelectMenuBuilder()
    .setCustomId('mod_quarantine_logs')
    .setPlaceholder('Search and select Quarantine Logs channel')
    .addChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);

  const quarantineRoleMenu = new RoleSelectMenuBuilder()
    .setCustomId('mod_quarantine_role')
    .setPlaceholder('Select Quarantine Role');

  const row1 = new ActionRowBuilder().addComponents(staffMenu);
  const row2 = new ActionRowBuilder().addComponents(logMenu);
  const row3 = new ActionRowBuilder().addComponents(quarantineRoleMenu);
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup_back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row1, row2, row3, row4] });
}

async function handlePingMenu(interaction) {
  const values = interaction.values || [];

  const pingIds = values.map((v) => {
    if (v.startsWith('role:')) return v;
    return v;
  });

  await Setup.updateOne({ guildId: interaction.guildId }, { trackerPingIds: pingIds }, { upsert: true });

  const display = pingIds.length > 0
    ? pingIds.map((id) => {
        if (id.startsWith('role:')) return `<@&${id.slice(5)}>`;
        return `<@${id}>`;
      }).join(' ')
    : 'None';

  return interaction.reply({ content: `Milestone ping targets updated: ${display}`, ephemeral: true });
}

async function handleQuarantineStaffMenu(interaction) {
  const roleId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { quarantineStaffRoleId: roleId }, { upsert: true });
  return interaction.reply({ content: `Quarantine Staff role set to <@&${roleId}>.`, ephemeral: true });
}

async function handleQuarantineLogsMenu(interaction) {
  const channelId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { quarantineLogChannelId: channelId }, { upsert: true });
  return interaction.reply({ content: `Quarantine Logs channel set to <#${channelId}>.`, ephemeral: true });
}

async function handleQuarantineRoleMenu(interaction) {
  const roleId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { quarantineRoleId: roleId }, { upsert: true });
  return interaction.reply({ content: `Quarantine Role set to <@&${roleId}>.`, ephemeral: true });
}

async function openTagSettings(interaction) {
  const setup = await getSetup(interaction.guildId);

  const status = setup.tagRoleEnabled && setup.tagRoleId
    ? `Enabled — Role: <@&${setup.tagRoleId}>`
    : 'Disabled';

  const logDisplay = setup.tagLogChannelId ? `<#${setup.tagLogChannelId}>` : 'Not set';

  const embed = new EmbedBuilder()
    .setTitle('🏷️ Auto Tag Role')
    .setColor(0x2b2d31)
    .setDescription(
      'Configure the role that is automatically given to members wearing this server\'s Server Tag.\n\n' +
      'When a member equips this server\'s tag, they receive the role. When they remove it or switch to another server\'s tag, the role is removed.',
    )
    .addFields(
      {
        name: 'Status',
        value: status,
        inline: false,
      },
      {
        name: 'Server Tag Logs',
        value: logDisplay,
        inline: false,
      },
    );

  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId('tag_role_menu')
    .setPlaceholder('Select the Server Tag Role');

  const logMenu = new ChannelSelectMenuBuilder()
    .setCustomId('tag_log_menu')
    .setPlaceholder('Search and select Server Tag Logs channel')
    .addChannelTypes(ChannelType.GuildText)
    .setMinValues(0)
    .setMaxValues(1);

  const disableButton = new ButtonBuilder()
    .setCustomId('tag_role_disable')
    .setLabel('Disable Auto Tag Role')
    .setStyle(ButtonStyle.Danger);

  const row1 = new ActionRowBuilder().addComponents(roleMenu);
  const row2 = new ActionRowBuilder().addComponents(logMenu);
  const row3 = new ActionRowBuilder().addComponents(
    disableButton,
    new ButtonBuilder().setCustomId('setup_back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row1, row2, row3] });
}

async function handleTagRoleMenu(interaction) {
  const roleId = interaction.values[0];
  await Setup.updateOne({ guildId: interaction.guildId }, { tagRoleId: roleId, tagRoleEnabled: true }, { upsert: true });
  return interaction.reply({ content: `Auto Tag Role set to <@&${roleId}>. Members wearing this server's tag will receive the role automatically.`, ephemeral: true });
}

async function handleTagRoleDisable(interaction) {
  await Setup.updateOne({ guildId: interaction.guildId }, { tagRoleEnabled: false, tagRoleId: null }, { upsert: true });
  return interaction.reply({ content: 'Auto Tag Role has been disabled.', ephemeral: true });
}

async function handleTagLogMenu(interaction) {
  const values = interaction.values || [];
  const channelId = values.length > 0 ? values[0] : null;
  await Setup.updateOne({ guildId: interaction.guildId }, { tagLogChannelId: channelId }, { upsert: true });
  if (channelId) {
    return interaction.reply({ content: `Server Tag Logs channel set to <#${channelId}>.`, ephemeral: true });
  }
  return interaction.reply({ content: 'Server Tag Logs channel has been removed.', ephemeral: true });
}

async function handleBack(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Bot Setup Dashboard')
    .setColor(0x2b2d31)
    .setDescription('Configure the bot below.');

  const trackerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tracker_settings')
      .setLabel('⚙️ Tracker Settings')
      .setStyle(ButtonStyle.Primary),
  );

  const modRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mod_settings')
      .setLabel('🛡️ Mod Settings')
      .setStyle(ButtonStyle.Secondary),
  );

  const tagRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tag_settings')
      .setLabel('🏷️ Auto Tag Role')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [trackerRow, modRow, tagRow] });
}

module.exports = {
  handleSetup,
  openTrackerSettings,
  openModSettings,
  openTagSettings,
  handlePingMenu,
  handleQuarantineStaffMenu,
  handleQuarantineLogsMenu,
  handleQuarantineRoleMenu,
  handleTagRoleMenu,
  handleTagRoleDisable,
  handleTagLogMenu,
  handleBack,
};
