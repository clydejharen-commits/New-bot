const Counter = require('../models/Counter');
const Order = require('../models/Order');
const robloxApi = require('../utils/robloxApi');
const logger = require('../utils/logger');

const AUTHORIZED_USER_ID = '1505729763296411891';

async function getNextOrderId() {
  const result = await Counter.findOneAndUpdate(
    { _id: 'order' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return `#${result.seq}`;
}

async function handleSend(message, args) {
  if (message.author.id !== AUTHORIZED_USER_ID) {
    return message.reply('You are not authorized to use this command.');
  }

  const username = args[0];
  const amountStr = args[1];

  if (!username || !amountStr) {
    return message.reply('Usage: `w! Send <Roblox username> <amount>`');
  }

  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount < 1) {
    return message.reply('Amount must be a positive number.');
  }

  if (username.length < 3 || username.length > 20) {
    return message.reply('Invalid Roblox username (must be 3-20 characters).');
  }

  let userInfo;
  try {
    userInfo = await robloxApi.getUserIdFromUsername(username);
  } catch (err) {
    logger.error(`Roblox username lookup failed for "${username}": ${err.message}`);
    return message.reply(`Roblox username lookup failed: ${err.message}`);
  }

  if (!userInfo) {
    return message.reply(`Could not find a Roblox user named "${username}".`);
  }

  let orderId;
  try {
    orderId = await getNextOrderId();
  } catch (err) {
    logger.error(`Failed to generate order ID: ${err.message}`);
    return message.reply('Failed to create order. Please try again.');
  }

  try {
    await Order.create({
      orderId,
      robloxUsername: userInfo.username,
      robloxUserId: userInfo.id,
      amount,
      createdBy: message.author.id,
      guildId: message.guild.id,
    });
  } catch (err) {
    logger.error(`Failed to save order: ${err.message}`);
    return message.reply('Failed to create order. Please try again.');
  }

  logger.info(`Order ${orderId} created by ${message.author.id} for ${userInfo.username} (${amount} followers)`);

  return message.reply(
    `Roblox Username: \`${userInfo.username}\`\n` +
    `Followers: \`${amount}\`\n` +
    `Order ID: \`${orderId}\``,
  );
}

module.exports = { handleSend, AUTHORIZED_USER_ID };
