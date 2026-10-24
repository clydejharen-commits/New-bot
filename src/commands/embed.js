const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  WebhookClient,
} = require('discord.js');
const logger = require('../utils/logger');

const {
  EmbedLimits,
  validateHex,
  validateUrl,
  validateEmbed,
  safeWebhookStatus,
  WEBHOOK_URL_RE,
} = require('../utils/embedValidation');

const SESSION_TTL_MS = 15 * 60 * 1000;

const sessions = new Map();
let sessionCounter = 0;

function nextSessionId() {
  sessionCounter += 1;
  return String(sessionCounter);
}

function isAdmin(member) {
  return !!(member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator));
}

function createDefaultState(ownerId, channelId, prefilled) {
  return {
    ownerId,
    channelId,
    text: prefilled.text || '',
    color: prefilled.color || '',
    footerText: prefilled.footer || '',
    footerIcon: prefilled.footerIcon || '',
    thumbnail: prefilled.thumbnail || '',
    image: prefilled.image || '',
    timestamp: prefilled.timestamp !== undefined && prefilled.timestamp !== null ? prefilled.timestamp : false,
    fields: [],
    delivery: prefilled.delivery || 'bot',
    webhookUrl: prefilled.webhookUrl || '',
    sent: false,
    createdAt: Date.now(),
  };
}

function buildEmbedFromState(state) {
  const embed = new EmbedBuilder();

  if (state.text) embed.setDescription(state.text);

  if (state.color) {
    const parsed = validateHex(state.color);
    if (parsed) embed.setColor(parsed);
  }

  if (state.footerText || state.footerIcon) {
    const footer = {};
    if (state.footerText) footer.text = state.footerText;
    if (state.footerIcon) footer.iconURL = state.footerIcon;
    embed.setFooter(footer);
  }

  if (state.thumbnail) embed.setThumbnail(state.thumbnail);
  if (state.image) embed.setImage(state.image);
  if (state.timestamp) embed.setTimestamp();

  if (state.fields.length > 0) {
    const validFields = state.fields
      .filter((f) => f.name && f.value)
      .map((f) => ({ name: f.name, value: f.value, inline: !!f.inline }));
    if (validFields.length > 0) embed.addFields(validFields);
  }

  return embed;
}

function buildPreviewContent(state) {
  const lines = [];

  lines.push(`**Text:** ${state.text || '*(empty)*'}`);
  lines.push(`**Color:** ${state.color || '*(default)*'}`);

  if (state.fields.length > 0) {
    lines.push(`**Fields (${state.fields.length}):**`);
    state.fields.forEach((f, i) => {
      lines.push(`  ${i + 1}. ${f.name || '*(unnamed)*'} — ${f.value || '*(empty)*'} ${f.inline ? '[inline]' : '[block]'}`);
    });
  } else {
    lines.push('**Fields:** *(none)*');
  }

  lines.push(`**Thumbnail:** ${state.thumbnail || '*(none)*'}`);
  lines.push(`**Image:** ${state.image || '*(none)*'}`);
  lines.push(`**Footer:** ${state.footerText || '*(none)*'}${state.footerIcon ? ' (with icon)' : ''}`);
  lines.push(`**Timestamp:** ${state.timestamp ? 'Enabled' : 'Disabled'}`);
  lines.push(`**Delivery:** ${state.delivery === 'webhook' ? 'Webhook' : 'Bot Message'}`);
  if (state.delivery === 'webhook') {
    lines.push(`**Webhook:** ${safeWebhookStatus(state.webhookUrl)}`);
  }

  let destLabel = 'Current channel';
  if (state.channelId) {
    destLabel = `<#${state.channelId}>`;
  }
  lines.push(`**Destination:** ${destLabel}`);

  return lines.join('\n');
}

function buildBuilderComponents(state, sid) {
  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_edit_text:${sid}`).setLabel('Edit Text').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embed_edit_color:${sid}`).setLabel('Edit Color').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embed_fields:${sid}`).setLabel('Manage Fields').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_images:${sid}`).setLabel('Manage Images').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_footer:${sid}`).setLabel('Edit Footer').setStyle(ButtonStyle.Secondary),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embed_timestamp:${sid}`)
      .setLabel(state.timestamp ? 'Timestamp: On' : 'Timestamp: Off')
      .setStyle(state.timestamp ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_webhook:${sid}`).setLabel('Webhook Settings').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_preview:${sid}`).setLabel('Preview').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embed_send:${sid}`).setLabel('Send').setStyle(ButtonStyle.Success),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_reset:${sid}`).setLabel('Reset').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`embed_cancel:${sid}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
  ));

  return rows;
}

function buildBuilderPanel(state, sid) {
  const previewEmbed = buildEmbedFromState(state);
  const infoEmbed = new EmbedBuilder()
    .setTitle('Embed Builder')
    .setColor(0x2b2d31)
    .setDescription(buildPreviewContent(state))
    .setFooter({ text: `Session owner: ${state.ownerId} • Expires in 15 minutes` });

  return { embeds: [infoEmbed, previewEmbed], components: buildBuilderComponents(state, sid) };
}

function buildFieldsPanel(state, sid) {
  const infoEmbed = new EmbedBuilder()
    .setTitle('Manage Fields')
    .setColor(0x2b2d31)
    .setDescription(
      state.fields.length > 0
        ? state.fields
            .map((f, i) => `**${i + 1}.** ${f.name || '*(unnamed)*'}\n   ${f.value || '*(empty)*'} ${f.inline ? '[inline]' : '[block]'}`)
            .join('\n')
        : 'No fields added yet.',
    )
    .setFooter({ text: `Fields: ${state.fields.length}/${EmbedLimits.fieldCount}` });

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embed_field_add:${sid}`)
      .setLabel('Add Field')
      .setStyle(ButtonStyle.Success)
      .setDisabled(state.fields.length >= EmbedLimits.fieldCount),
    new ButtonBuilder()
      .setCustomId(`embed_field_edit:${sid}`)
      .setLabel('Edit Field')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state.fields.length === 0),
    new ButtonBuilder()
      .setCustomId(`embed_field_remove:${sid}`)
      .setLabel('Remove Field')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(state.fields.length === 0),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_back:${sid}`).setLabel('Back to Builder').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [infoEmbed], components: rows };
}

function buildFieldSelectMenu(state, sid, action) {
  const options = state.fields.map((f, i) => ({
    label: `${i + 1}. ${f.name ? f.name.slice(0, 100) : 'Unnamed'}`,
    value: String(i),
    description: f.value ? f.value.slice(0, 100) : 'Empty value',
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`embed_field_${action}_select:${sid}`)
      .setPlaceholder(`Select a field to ${action}`)
      .addOptions(options),
  );
}

function buildImagesPanel(state, sid) {
  const infoEmbed = new EmbedBuilder()
    .setTitle('Manage Images')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'Thumbnail', value: state.thumbnail || '*(not set)*', inline: false },
      { name: 'Large Image', value: state.image || '*(not set)*', inline: false },
    );

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_set_thumbnail:${sid}`).setLabel('Set Thumbnail').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`embed_clear_thumbnail:${sid}`)
      .setLabel('Clear Thumbnail')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!state.thumbnail),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_set_image:${sid}`).setLabel('Set Image').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`embed_clear_image:${sid}`)
      .setLabel('Clear Image')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!state.image),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_back:${sid}`).setLabel('Back to Builder').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [infoEmbed], components: rows };
}

function buildFooterPanel(state, sid) {
  const infoEmbed = new EmbedBuilder()
    .setTitle('Edit Footer')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'Footer Text', value: state.footerText || '*(not set)*', inline: false },
      { name: 'Footer Icon', value: state.footerIcon || '*(not set)*', inline: false },
    );

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_set_footer_text:${sid}`).setLabel('Set Footer Text').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embed_set_footer_icon:${sid}`).setLabel('Set Footer Icon').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`embed_clear_footer:${sid}`)
      .setLabel('Clear Footer')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!state.footerText && !state.footerIcon),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_back:${sid}`).setLabel('Back to Builder').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [infoEmbed], components: rows };
}

function buildWebhookPanel(state, sid) {
  const infoEmbed = new EmbedBuilder()
    .setTitle('Webhook Settings')
    .setColor(0x2b2d31)
    .setDescription(
      `**Delivery Method:** ${state.delivery === 'webhook' ? 'Webhook' : 'Bot Message'}\n` +
      `**Webhook URL:** ${safeWebhookStatus(state.webhookUrl)}\n\n` +
      'When using webhook delivery, the embed is sent through the webhook you provide. ' +
      'The URL is stored only in this session and cleared when the session ends.',
    );

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`embed_delivery_menu:${sid}`)
      .setPlaceholder('Select delivery method')
      .addOptions([
        { label: 'Bot Message', value: 'bot', description: 'Send as the bot in the selected channel', default: state.delivery === 'bot' },
        { label: 'Webhook', value: 'webhook', description: 'Send through a Discord webhook URL', default: state.delivery === 'webhook' },
      ]),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embed_set_webhook_url:${sid}`)
      .setLabel('Set Webhook URL')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state.delivery !== 'webhook'),
    new ButtonBuilder().setCustomId(`embed_back:${sid}`).setLabel('Back to Builder').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [infoEmbed], components: rows };
}

function buildResetConfirmPanel(state, sid) {
  const infoEmbed = new EmbedBuilder()
    .setTitle('Confirm Reset')
    .setColor(0xed4245)
    .setDescription('Are you sure you want to clear the current embed configuration? This cannot be undone.');

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_reset_confirm:${sid}`).setLabel('Yes, Reset').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`embed_back:${sid}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [infoEmbed], components: rows };
}

function parseCustomId(customId) {
  const parts = customId.split(':');
  const action = parts[0];
  const sid = parts[1] || null;
  const extra = parts[2] !== undefined ? parts[2] : null;
  return { action, sid, extra };
}

function getSession(sid) {
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function isSessionOwner(interaction, state) {
  return state && interaction.user.id === state.ownerId;
}

function isSessionExpired(state) {
  return Date.now() - state.createdAt > SESSION_TTL_MS;
}

function safeReply(interaction, payload) {
  const opts = typeof payload === 'string' ? { content: payload } : payload;
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(opts);
  }
  return interaction.reply({ ...opts, ephemeral: true });
}

async function updatePanel(interaction, panelPayload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(panelPayload);
  }
  return interaction.update(panelPayload);
}

function checkAccess(interaction, sid) {
  if (!isAdmin(interaction.member)) {
    return { ok: false, reply: 'You need Administrator permission to use this command.' };
  }

  const state = getSession(sid);
  if (!state) {
    return { ok: false, reply: 'This builder session has expired. Please run `/embed` again to start a new one.' };
  }

  if (!isSessionOwner(interaction, state)) {
    return { ok: false, reply: 'Only the administrator who opened this builder session can control it.' };
  }

  if (isSessionExpired(state)) {
    sessions.delete(sid);
    return { ok: false, reply: 'This builder session has expired. Please run `/embed` again to start a new one.' };
  }

  return { ok: true, state };
}

async function handleEmbedCommand(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const channelOpt = interaction.options.getChannel('channel');
  const channelId = channelOpt ? channelOpt.id : interaction.channelId;

  const prefilled = {
    text: interaction.options.getString('text') || '',
    color: interaction.options.getString('color') || '',
    footer: interaction.options.getString('footer') || '',
    footerIcon: interaction.options.getString('footer_icon') || '',
    thumbnail: interaction.options.getString('thumbnail') || '',
    image: interaction.options.getString('image') || '',
    timestamp: interaction.options.getBoolean('timestamp'),
    delivery: interaction.options.getString('webhook') || 'bot',
    webhookUrl: interaction.options.getString('webhook_url') || '',
  };

  if (prefilled.delivery === 'webhook' && prefilled.webhookUrl && !WEBHOOK_URL_RE.test(prefilled.webhookUrl)) {
    return interaction.editReply('The provided webhook URL is not a valid Discord webhook URL.');
  }
  if (prefilled.color && !validateHex(prefilled.color)) {
    return interaction.editReply('The provided color is not a valid HEX color. Example: `#5865F2`');
  }
  if (prefilled.thumbnail && !validateUrl(prefilled.thumbnail)) {
    return interaction.editReply('The provided thumbnail URL is not a valid URL.');
  }
  if (prefilled.image && !validateUrl(prefilled.image)) {
    return interaction.editReply('The provided image URL is not a valid URL.');
  }
  if (prefilled.footerIcon && !validateUrl(prefilled.footerIcon)) {
    return interaction.editReply('The provided footer icon URL is not a valid URL.');
  }

  const state = createDefaultState(interaction.user.id, channelId, prefilled);
  const sid = nextSessionId();
  sessions.set(sid, state);

  return interaction.editReply(buildBuilderPanel(state, sid));
}

async function handleEmbedButton(interaction) {
  const { action, sid, extra } = parseCustomId(interaction.customId);
  const access = checkAccess(interaction, sid);
  if (!access.ok) return safeReply(interaction, access.reply);
  const state = access.state;

  switch (action) {
    case 'embed_edit_text':
      return showEditTextModal(interaction, state, sid);
    case 'embed_edit_color':
      return showEditColorModal(interaction, state, sid);
    case 'embed_fields':
      return updatePanel(interaction, buildFieldsPanel(state, sid));
    case 'embed_images':
      return updatePanel(interaction, buildImagesPanel(state, sid));
    case 'embed_footer':
      return updatePanel(interaction, buildFooterPanel(state, sid));
    case 'embed_timestamp':
      state.timestamp = !state.timestamp;
      return updatePanel(interaction, buildBuilderPanel(state, sid));
    case 'embed_webhook':
      return updatePanel(interaction, buildWebhookPanel(state, sid));
    case 'embed_preview':
      return updatePanel(interaction, buildBuilderPanel(state, sid));
    case 'embed_send':
      return handleSend(interaction, state, sid);
    case 'embed_reset':
      return updatePanel(interaction, buildResetConfirmPanel(state, sid));
    case 'embed_reset_confirm':
      return handleResetConfirm(interaction, state, sid);
    case 'embed_cancel':
      sessions.delete(sid);
      return updatePanel(interaction, {
        embeds: [new EmbedBuilder().setTitle('Embed Builder Closed').setColor(0x2b2d31).setDescription('The builder has been closed without sending anything.')],
        components: [],
      });
    case 'embed_back':
      return updatePanel(interaction, buildBuilderPanel(state, sid));
    case 'embed_set_thumbnail':
      return showSetImageModal(interaction, sid, 'thumbnail');
    case 'embed_clear_thumbnail':
      state.thumbnail = '';
      return updatePanel(interaction, buildImagesPanel(state, sid));
    case 'embed_set_image':
      return showSetImageModal(interaction, sid, 'image');
    case 'embed_clear_image':
      state.image = '';
      return updatePanel(interaction, buildImagesPanel(state, sid));
    case 'embed_set_footer_text':
      return showSetFooterTextModal(interaction, state, sid);
    case 'embed_set_footer_icon':
      return showSetFooterIconModal(interaction, state, sid);
    case 'embed_clear_footer':
      state.footerText = '';
      state.footerIcon = '';
      return updatePanel(interaction, buildFooterPanel(state, sid));
    case 'embed_set_webhook_url':
      return showSetWebhookUrlModal(interaction, sid);
    case 'embed_field_add':
      return showFieldModal(interaction, sid, 'add');
    case 'embed_field_edit':
      if (state.fields.length === 0) return safeReply(interaction, 'There are no fields to edit.');
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle('Edit Field').setColor(0x2b2d31).setDescription('Select a field to edit.')],
        components: [
          buildFieldSelectMenu(state, sid, 'edit'),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`embed_back_fields:${sid}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    case 'embed_field_remove':
      if (state.fields.length === 0) return safeReply(interaction, 'There are no fields to remove.');
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle('Remove Field').setColor(0x2b2d31).setDescription('Select a field to remove.')],
        components: [
          buildFieldSelectMenu(state, sid, 'remove'),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`embed_back_fields:${sid}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    case 'embed_back_fields':
      return updatePanel(interaction, buildFieldsPanel(state, sid));
    default:
      return safeReply(interaction, 'Unknown action.');
  }
}

async function handleEmbedSelectMenu(interaction) {
  const { action, sid } = parseCustomId(interaction.customId);
  const access = checkAccess(interaction, sid);
  if (!access.ok) return safeReply(interaction, access.reply);
  const state = access.state;

  switch (action) {
    case 'embed_delivery_menu': {
      const value = interaction.values[0];
      state.delivery = value;
      if (value !== 'webhook') {
        state.webhookUrl = '';
      }
      return updatePanel(interaction, buildWebhookPanel(state, sid));
    }
    case 'embed_field_edit_select': {
      const idx = parseInt(interaction.values[0], 10);
      return showFieldModal(interaction, sid, 'edit', idx);
    }
    case 'embed_field_remove_select': {
      const idx = parseInt(interaction.values[0], 10);
      state.fields.splice(idx, 1);
      return updatePanel(interaction, buildFieldsPanel(state, sid));
    }
    default:
      return safeReply(interaction, 'Unknown action.');
  }
}

async function handleEmbedModalSubmit(interaction) {
  const { action, sid, extra } = parseCustomId(interaction.customId);
  const access = checkAccess(interaction, sid);
  if (!access.ok) return safeReply(interaction, access.reply);
  const state = access.state;

  switch (action) {
    case 'embed_modal_text': {
      const text = interaction.fields.getTextInputValue('embed_text_input');
      if (text.length > EmbedLimits.description) {
        return safeReply(interaction, `Text is too long. Maximum is ${EmbedLimits.description} characters (you entered ${text.length}).`);
      }
      state.text = text;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildBuilderPanel(state, sid));
    }
    case 'embed_modal_color': {
      const color = interaction.fields.getTextInputValue('embed_color_input');
      if (color && !validateHex(color)) {
        return safeReply(interaction, 'Invalid HEX color. Use a format like `#5865F2` or `5865F2`.');
      }
      state.color = color;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildBuilderPanel(state, sid));
    }
    case 'embed_modal_thumbnail': {
      const url = interaction.fields.getTextInputValue('embed_thumbnail_input');
      if (url && !validateUrl(url)) {
        return safeReply(interaction, 'The provided thumbnail URL is not a valid URL.');
      }
      state.thumbnail = url;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildImagesPanel(state, sid));
    }
    case 'embed_modal_image': {
      const url = interaction.fields.getTextInputValue('embed_image_input');
      if (url && !validateUrl(url)) {
        return safeReply(interaction, 'The provided image URL is not a valid URL.');
      }
      state.image = url;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildImagesPanel(state, sid));
    }
    case 'embed_modal_footer_text': {
      const text = interaction.fields.getTextInputValue('embed_footer_text_input');
      if (text.length > EmbedLimits.footerText) {
        return safeReply(interaction, `Footer text is too long. Maximum is ${EmbedLimits.footerText} characters (you entered ${text.length}).`);
      }
      state.footerText = text;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildFooterPanel(state, sid));
    }
    case 'embed_modal_footer_icon': {
      const url = interaction.fields.getTextInputValue('embed_footer_icon_input');
      if (url && !validateUrl(url)) {
        return safeReply(interaction, 'The provided footer icon URL is not a valid URL.');
      }
      state.footerIcon = url;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildFooterPanel(state, sid));
    }
    case 'embed_modal_webhook_url': {
      const url = interaction.fields.getTextInputValue('embed_webhook_url_input');
      if (!url || !WEBHOOK_URL_RE.test(url)) {
        return safeReply(interaction, 'The provided URL is not a valid Discord webhook URL.');
      }
      state.webhookUrl = url;
      await interaction.deferUpdate();
      return updatePanel(interaction, buildWebhookPanel(state, sid));
    }
    case 'embed_modal_field_add': {
      const name = interaction.fields.getTextInputValue('embed_field_name');
      const value = interaction.fields.getTextInputValue('embed_field_value');
      const inlineRaw = interaction.fields.getTextInputValue('embed_field_inline');

      if (state.fields.length >= EmbedLimits.fieldCount) {
        return safeReply(interaction, `You can only have up to ${EmbedLimits.fieldCount} fields.`);
      }
      if (!name || !value) {
        return safeReply(interaction, 'Field name and value cannot be empty.');
      }
      if (name.length > EmbedLimits.fieldName) {
        return safeReply(interaction, `Field name is too long. Maximum is ${EmbedLimits.fieldName} characters.`);
      }
      if (value.length > EmbedLimits.fieldValue) {
        return safeReply(interaction, `Field value is too long. Maximum is ${EmbedLimits.fieldValue} characters.`);
      }

      const inline = inlineRaw.trim().toLowerCase() === 'yes' || inlineRaw.trim().toLowerCase() === 'true' || inlineRaw.trim() === '1';
      state.fields.push({ name, value, inline });
      await interaction.deferUpdate();
      return updatePanel(interaction, buildFieldsPanel(state, sid));
    }
    case 'embed_modal_field_edit': {
      const idx = parseInt(extra, 10);
      if (isNaN(idx) || idx < 0 || idx >= state.fields.length) {
        return safeReply(interaction, 'Could not find the field to edit. It may have been removed.');
      }

      const name = interaction.fields.getTextInputValue('embed_field_name');
      const value = interaction.fields.getTextInputValue('embed_field_value');
      const inlineRaw = interaction.fields.getTextInputValue('embed_field_inline');

      if (!name || !value) {
        return safeReply(interaction, 'Field name and value cannot be empty.');
      }
      if (name.length > EmbedLimits.fieldName) {
        return safeReply(interaction, `Field name is too long. Maximum is ${EmbedLimits.fieldName} characters.`);
      }
      if (value.length > EmbedLimits.fieldValue) {
        return safeReply(interaction, `Field value is too long. Maximum is ${EmbedLimits.fieldValue} characters.`);
      }

      const inline = inlineRaw.trim().toLowerCase() === 'yes' || inlineRaw.trim().toLowerCase() === 'true' || inlineRaw.trim() === '1';
      state.fields[idx] = { name, value, inline };
      await interaction.deferUpdate();
      return updatePanel(interaction, buildFieldsPanel(state, sid));
    }
    default:
      return safeReply(interaction, 'Unknown modal action.');
  }
}

function showEditTextModal(interaction, state, sid) {
  const modal = new ModalBuilder()
    .setCustomId(`embed_modal_text:${sid}`)
    .setTitle('Edit Embed Text');

  const input = new TextInputBuilder()
    .setCustomId('embed_text_input')
    .setLabel('Main embed text (description)')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(state.text || '')
    .setRequired(false)
    .setMaxLength(Math.min(EmbedLimits.description, 4000));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

function showEditColorModal(interaction, state, sid) {
  const modal = new ModalBuilder()
    .setCustomId(`embed_modal_color:${sid}`)
    .setTitle('Edit Embed Color');

  const input = new TextInputBuilder()
    .setCustomId('embed_color_input')
    .setLabel('HEX color (e.g. #5865F2)')
    .setStyle(TextInputStyle.Short)
    .setValue(state.color || '')
    .setRequired(false)
    .setMaxLength(7);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

function showSetImageModal(interaction, sid, type) {
  const modal = new ModalBuilder()
    .setCustomId(`embed_modal_${type}:${sid}`)
    .setTitle(type === 'thumbnail' ? 'Set Thumbnail' : 'Set Large Image');

  const input = new TextInputBuilder()
    .setCustomId(`embed_${type}_input`)
    .setLabel('Image URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

function showSetFooterTextModal(interaction, state, sid) {
  const modal = new ModalBuilder()
    .setCustomId(`embed_modal_footer_text:${sid}`)
    .setTitle('Set Footer Text');

  const input = new TextInputBuilder()
    .setCustomId('embed_footer_text_input')
    .setLabel('Footer text')
    .setStyle(TextInputStyle.Short)
    .setValue(state.footerText || '')
    .setRequired(false)
    .setMaxLength(Math.min(EmbedLimits.footerText, 4000));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

function showSetFooterIconModal(interaction, state, sid) {
  const modal = new ModalBuilder()
    .setCustomId(`embed_modal_footer_icon:${sid}`)
    .setTitle('Set Footer Icon');

  const input = new TextInputBuilder()
    .setCustomId('embed_footer_icon_input')
    .setLabel('Footer icon URL')
    .setStyle(TextInputStyle.Short)
    .setValue(state.footerIcon || '')
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

function showSetWebhookUrlModal(interaction, sid) {
  const modal = new ModalBuilder()
    .setCustomId(`embed_modal_webhook_url:${sid}`)
    .setTitle('Set Webhook URL');

  const input = new TextInputBuilder()
    .setCustomId('embed_webhook_url_input')
    .setLabel('Discord webhook URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://discord.com/api/webhooks/...')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

function showFieldModal(interaction, sid, mode, fieldIdx) {
  const state = sessions.get(sid);
  const title = mode === 'add' ? 'Add Field' : 'Edit Field';
  const customId = mode === 'add'
    ? `embed_modal_field_add:${sid}`
    : `embed_modal_field_edit:${sid}:${fieldIdx}`;

  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const existing = mode === 'edit' && state && !isNaN(fieldIdx) && state.fields[fieldIdx]
    ? state.fields[fieldIdx]
    : { name: '', value: '', inline: false };

  const nameInput = new TextInputBuilder()
    .setCustomId('embed_field_name')
    .setLabel('Field name')
    .setStyle(TextInputStyle.Short)
    .setValue(existing.name || '')
    .setRequired(true)
    .setMaxLength(Math.min(EmbedLimits.fieldName, 4000));

  const valueInput = new TextInputBuilder()
    .setCustomId('embed_field_value')
    .setLabel('Field value')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(existing.value || '')
    .setRequired(true)
    .setMaxLength(Math.min(EmbedLimits.fieldValue, 4000));

  const inlineInput = new TextInputBuilder()
    .setCustomId('embed_field_inline')
    .setLabel('Inline? (yes/no)')
    .setStyle(TextInputStyle.Short)
    .setValue(existing.inline ? 'yes' : 'no')
    .setRequired(false)
    .setMaxLength(3);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(valueInput),
    new ActionRowBuilder().addComponents(inlineInput),
  );

  return interaction.showModal(modal);
}

async function handleSend(interaction, state, sid) {
  if (state.sent) {
    return safeReply(interaction, 'This embed has already been sent from this session. Start a new session with `/embed` to send another.');
  }

  if (!isAdmin(interaction.member)) {
    return safeReply(interaction, 'You need Administrator permission to send an embed.');
  }

  const validation = validateEmbed(state);
  if (!validation.valid) {
    return safeReply(interaction, `Cannot send embed: ${validation.reason}`);
  }

  const embed = buildEmbedFromState(state);
  const allowedMentions = { parse: [] };

  if (state.delivery === 'webhook') {
    if (!state.webhookUrl || !WEBHOOK_URL_RE.test(state.webhookUrl)) {
      return safeReply(interaction, 'A valid webhook URL is required for webhook delivery. Set one in Webhook Settings.');
    }

    const match = state.webhookUrl.match(WEBHOOK_URL_RE);
    const webhookId = match[1];
    const webhookToken = match[2];

    if (!webhookId || !webhookToken) {
      return safeReply(interaction, 'The webhook URL is malformed. Please provide a valid Discord webhook URL.');
    }

    let webhookClient;
    try {
      webhookClient = new WebhookClient({ id: webhookId, token: webhookToken });
      await webhookClient.send({ embeds: [embed], allowedMentions });
      webhookClient.destroy();
    } catch (err) {
      if (webhookClient) webhookClient.destroy();
      logger.error('Webhook send failed:', err.message);
      let userMsg = 'Failed to send the embed through the webhook.';
      if (err.code === 10015) userMsg = 'The webhook does not exist or has been deleted.';
      else if (err.code === 50027) userMsg = 'The webhook token is invalid or has been revoked.';
      else if (err.status === 429) userMsg = 'The webhook is rate limited. Please try again in a moment.';
      return safeReply(interaction, userMsg);
    }

    state.sent = true;
    sessions.delete(sid);

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: 'Embed sent via webhook. Webhook configured.', ephemeral: true });
    }
    return interaction.reply({ content: 'Embed sent via webhook. Webhook configured.', ephemeral: true });
  }

  const guild = interaction.guild;
  if (!guild) {
    return safeReply(interaction, 'This command can only be used in a server.');
  }

  const targetChannel = guild.channels.cache.get(state.channelId);
  if (!targetChannel) {
    return safeReply(interaction, 'The destination channel could not be found.');
  }

  const botMember = await guild.members.fetch(interaction.client.user.id).catch(() => null);
  if (!botMember) {
    return safeReply(interaction, 'Could not verify bot permissions in this server.');
  }

  const botPerms = targetChannel.permissionsFor(botMember);
  if (!botPerms || !botPerms.has(PermissionFlagsBits.ViewChannel)) {
    return safeReply(interaction, `I don't have permission to view the destination channel ${targetChannel}.`);
  }
  if (!botPerms.has(PermissionFlagsBits.SendMessages)) {
    return safeReply(interaction, `I don't have permission to send messages in ${targetChannel}.`);
  }
  if (!botPerms.has(PermissionFlagsBits.EmbedLinks)) {
    return safeReply(interaction, `I don't have permission to embed links in ${targetChannel}.`);
  }

  try {
    await targetChannel.send({ embeds: [embed], allowedMentions });
  } catch (err) {
    logger.error('Bot message send failed:', err.message);
    return safeReply(interaction, 'Failed to send the embed. The bot may lack permissions or the channel may be unavailable.');
  }

  state.sent = true;
  sessions.delete(sid);

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ content: `Embed sent to ${targetChannel}.`, ephemeral: true });
  }
  return interaction.reply({ content: `Embed sent to ${targetChannel}.`, ephemeral: true });
}

async function handleResetConfirm(interaction, state, sid) {
  state.text = '';
  state.color = '';
  state.footerText = '';
  state.footerIcon = '';
  state.thumbnail = '';
  state.image = '';
  state.timestamp = false;
  state.fields = [];
  state.delivery = 'bot';
  state.webhookUrl = '';
  state.sent = false;

  return updatePanel(interaction, buildBuilderPanel(state, sid));
}

module.exports = {
  handleEmbedCommand,
  handleEmbedButton,
  handleEmbedSelectMenu,
  handleEmbedModalSubmit,
  sessions,
};
