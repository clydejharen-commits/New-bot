const WEBHOOK_URL_RE = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/(\d+)\/([\w-]+)$/;

const EmbedLimits = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fieldCount: 25,
  footerText: 2048,
  authorName: 256,
  totalChars: 6000,
  totalCharsWithNormalContent: 6000,
};

function validateHex(input) {
  if (!input) return null;
  let hex = input.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

function validateUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateEmbed(state) {
  const errors = [];

  const hasContent =
    (state.text && state.text.trim().length > 0) ||
    (state.fields && state.fields.some((f) => (f.name && f.name.trim()) || (f.value && f.value.trim()))) ||
    (state.thumbnail && state.thumbnail.trim()) ||
    (state.image && state.image.trim()) ||
    (state.footerText && state.footerText.trim());

  if (!hasContent) {
    return { valid: false, reason: 'The embed is empty. Add text, fields, images, or footer content before sending. A color alone does not count as content.' };
  }

  if (state.text && state.text.length > EmbedLimits.description) {
    errors.push(`Main text exceeds ${EmbedLimits.description} characters.`);
  }

  if (state.fields && state.fields.length > EmbedLimits.fieldCount) {
    errors.push(`Too many fields. Maximum is ${EmbedLimits.fieldCount}.`);
  }

  if (state.fields) {
    state.fields.forEach((f, i) => {
      if (f.name && f.name.length > EmbedLimits.fieldName) {
        errors.push(`Field ${i + 1} name exceeds ${EmbedLimits.fieldName} characters.`);
      }
      if (f.value && f.value.length > EmbedLimits.fieldValue) {
        errors.push(`Field ${i + 1} value exceeds ${EmbedLimits.fieldValue} characters.`);
      }
    });
  }

  if (state.footerText && state.footerText.length > EmbedLimits.footerText) {
    errors.push(`Footer text exceeds ${EmbedLimits.footerText} characters.`);
  }

  if (state.color && !validateHex(state.color)) {
    errors.push('Invalid HEX color.');
  }

  if (state.thumbnail && !validateUrl(state.thumbnail)) {
    errors.push('Invalid thumbnail URL.');
  }

  if (state.image && !validateUrl(state.image)) {
    errors.push('Invalid image URL.');
  }

  if (state.footerIcon && !validateUrl(state.footerIcon)) {
    errors.push('Invalid footer icon URL.');
  }

  let totalChars = 0;
  if (state.text) totalChars += state.text.length;
  if (state.footerText) totalChars += state.footerText.length;
  if (state.fields) {
    state.fields.forEach((f) => {
      if (f.name) totalChars += f.name.length;
      if (f.value) totalChars += f.value.length;
    });
  }
  if (totalChars > EmbedLimits.totalChars) {
    errors.push(`Total embed text exceeds ${EmbedLimits.totalChars} characters.`);
  }

  if (errors.length > 0) {
    return { valid: false, reason: errors.join(' ') };
  }

  return { valid: true };
}

function safeWebhookStatus(url) {
  if (!url) return 'Not configured';
  if (WEBHOOK_URL_RE.test(url)) return 'Webhook configured';
  return 'Invalid';
}

module.exports = {
  EmbedLimits,
  validateHex,
  validateUrl,
  validateEmbed,
  safeWebhookStatus,
  WEBHOOK_URL_RE,
};
