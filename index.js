// Load environment variables
require('dotenv').config();

const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');

// Import modules
const { authorizeUser, isUserAuthorized } = require('./db/userDatabase');
const { handleGodCommand } = require('./bot/commands');
const { handleInlineQuery } = require('./bot/inlineQuery');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 8888;
const CACHE_DIR = path.join(__dirname, process.env.CACHE_DIR || 'cache');

// Initialize Bot and Server
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Serve cached audio files
app.use('/audio', express.static(CACHE_DIR));

// Start Express server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Register Bot Commands
bot.command('god', handleGodCommand(authorizeUser));

// Register Inline Query Handler
bot.on('inline_query', handleInlineQuery(isUserAuthorized));

// Launch Bot
bot.launch()
  .then(() => console.log('Bot is running...'))
  .catch((error) => console.error('Failed to launch bot:', error));

// Graceful Shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));