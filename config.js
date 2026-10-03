const path = require('node:path');

function required(env, key) {
  if (!env[key]?.trim()) throw new Error(`Missing configuration: ${key}`);
  return env[key].trim();
}

function port(value, fallback) {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return number;
}

function httpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected an HTTP(S) URL');
  return url.href.replace(/\/$/, '');
}

function loadConfig(env = process.env) {
  const allowedUserIds = (env.ALLOWED_USER_IDS || '').split(',').filter(id => id.trim()).map(id => Number(id.trim()));
  if (!allowedUserIds.length || allowedUserIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('ALLOWED_USER_IDS must contain positive Telegram user IDs');
  }
  return {
    botToken: required(env, 'BOT_TOKEN'),
    port: port(env.PORT, 8888),
    host: env.HOST || '127.0.0.1',
    userDb: path.resolve(__dirname, env.USER_DB || 'users.json'),
    cacheDir: path.resolve(__dirname, env.CACHE_DIR || 'cache'),
    audioBaseUrl: httpUrl(required(env, 'AUDIO_BASE_URL')),
    backendUrl: httpUrl(env.BACKEND_URL || 'http://127.0.0.1:3012'),
    allowedUserIds,
  };
}

module.exports = { loadConfig, required, port, httpUrl };
