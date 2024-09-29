require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const PocketBase = require('pocketbase/cjs');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);
const pb = new PocketBase(process.env.POCKETBASE_URL);

// Check PocketBase connection
pb.health.check()
  .then(() => console.log('Connected to PocketBase'))
  .catch(error => {
    console.error('Failed to connect to PocketBase:', error);
    process.exit(1);
  });

// Function to generate a unique code based on chat ID
function generateUniqueCode(chatId) {
  const hash = crypto.createHash('sha256');
  hash.update(chatId.toString() + process.env.UNIQUE_CODE_SALT);
  return hash.digest('hex').substring(0, 10);
}

// Function to save user data to PocketBase
async function saveUserData(userData) {
  try {
    const { chatId, ...data } = userData;
    const uniqueCode = generateUniqueCode(chatId);
    const existingUser = await getUserData(chatId);
    if (existingUser) {
      await pb.collection('tele_users').update(existingUser.id, {
        ...data,
        uniqueCode
      });
      console.log('User data updated successfully');
      return uniqueCode;
    } else {
      const newUser = await pb.collection('tele_users').create({
        ...data,
        chatId,
        uniqueCode
      });
      console.log('User data saved successfully');
      return uniqueCode;
    }
  } catch (error) {
    console.error('Error saving user data:', error);
    return null;
  }
}

// Function to get user data from PocketBase
async function getUserData(chatId) {
  try {
    const record = await pb.collection('tele_users').getFirstListItem(`chatId="${chatId}"`);
    return record;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    console.error('Error fetching user data:', error);
    throw error;
  }
}

// Start command handler
bot.command('start', async (ctx) => {
  const user = ctx.from;
  const chat = ctx.chat;

  const userData = {
    chatId: chat.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
  };

  const uniqueCode = await saveUserData(userData);

  if (uniqueCode) {
    // Send welcome message with buttons
    await ctx.reply(
      `Welcome, ${user.first_name}! Your unique code has been generated.`,
      Markup.keyboard([
        ['📊 Get my info ahah', '🌐 Visit website'],
        ['❓ Help', '🔄 my code']
      ]).resize()
    );

    // Send unique code in a separate message for easy copying
    await ctx.reply(
      `Your unique code:\n\n<code>${uniqueCode}</code>\n\nPlease copy this code and paste it on our website to connect your Telegram account.`,
      { parse_mode: 'HTML' }
    );
  } else {
    ctx.reply('Sorry, there was an error processing your request. Please try again later.');
  }
});

// Help command handler
bot.hears('❓ Help', (ctx) => {
  ctx.reply(
    'Available commands:\n' +
    '📊 Get my info - View your saved information\n' +
    '🌐 Visit website - Go to our website\n' +
    '❓ Help - Show this help message\n' +
    '🔄 my code - Get the code again'
  );
});

// Info command handler
bot.hears('📊 Get my info', async (ctx) => {
  const userData = await getUserData(ctx.chat.id);
  if (userData) {
    ctx.reply(
      `Your information:\n\n` +
      `Name: ${userData.firstName} ${userData.lastName}\n` +
      `Username: @${userData.username}\n` +
      `Unique Code: <code>${userData.uniqueCode}</code>`,
      { parse_mode: 'HTML' }
    );
  } else {
    ctx.reply('No information found. Please use /start to register.');
  }
});

// Visit website handler
bot.hears('🌐 Visit website', (ctx) => {
  ctx.reply('Visit our website:', Markup.inlineKeyboard([
    Markup.button.url('Go to website', 'https://redruby.one/account/profile')
  ]));
});

// Regenerate code handler
bot.hears('🔄 my code', async (ctx) => {
  const user = ctx.from;
  const chat = ctx.chat;

  const userData = {
    chatId: chat.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
  };

  const newUniqueCode = await saveUserData(userData);

  if (newUniqueCode) {
    ctx.reply(
      `Your new unique code:\n\n<code>${newUniqueCode}</code>\n\nPlease use this new code to connect your Telegram account on our website.`,
      { parse_mode: 'HTML' }
    );
  } else {
    ctx.reply('Sorry, there was an error regenerating your code. Please try again later.');
  }
});

// Error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

// Start the bot
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));