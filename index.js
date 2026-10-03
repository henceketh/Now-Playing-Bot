const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('node:fs/promises');
const express = require('express');
const { Telegraf } = require('telegraf');
const { loadConfig } = require('./config');
const { createUserDatabase } = require('./db/userDatabase');
const { createTrackService } = require('./utils/download');
const { handleGodCommand } = require('./bot/commands');
const { handleInlineQuery } = require('./bot/inlineQuery');

async function main() {
  const config = loadConfig();
  await fs.mkdir(config.cacheDir, { recursive: true });
  const users = createUserDatabase(config.userDb);
  const tracks = createTrackService(config);
  const bot = new Telegraf(config.botToken);
  const app = express();
  app.disable('x-powered-by');
  app.get('/audio/:file', (req, res, next) => {
    if (!/^[a-f0-9]{64}\.mp3$/.test(req.params.file)) return res.sendStatus(404);
    next();
  }, express.static(config.cacheDir, { dotfiles: 'deny', index: false }));
  bot.command('god', handleGodCommand(users.authorizeUser, config.allowedUserIds));
  bot.on('inline_query', handleInlineQuery({ ...users, ...config, tracks }));
  bot.catch(() => console.error('Telegram update failed.'));

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(config.port, config.host, () => resolve(listener));
    listener.once('error', reject);
  });
  let stopped = false;
  function shutdown(signal) {
    if (stopped) return;
    stopped = true;
    try { bot.stop(signal); } catch { /* Polling may not have started yet. */ }
    server.close();
    server.closeAllConnections();
  }
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  console.log(`Audio server listening on ${config.host}:${config.port}`);
  // launch() stays pending while long polling runs.
  try { await bot.launch(); } catch (error) { shutdown('launch failed'); throw error; }
}

if (require.main === module) main().catch(error => { console.error(`Bot startup failed: ${error.message}`); process.exitCode = 1; });
module.exports = { main };
