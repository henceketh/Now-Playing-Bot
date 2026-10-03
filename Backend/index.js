const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createSpotifyClient } = require('./services/spotifyClient');
const { loadConfig } = require('./config');
const { createSpotifyService } = require('./services/spotify');
const { createDownloader } = require('./services/downloader');
const { createLyricsService } = require('./services/lyrics');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  const api = createSpotifyClient(config);
  const spotify = createSpotifyService(api, config.tokenFile);
  await spotify.load();
  const app = createApp({ api, spotify, downloader: createDownloader(config.youtubeApiKey), lyrics: createLyricsService(config), secureCookie: config.redirectUri.startsWith('https:') });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(config.port, config.host, () => resolve(listener));
    listener.once('error', reject);
  });
  console.log(`Spotify backend listening on ${config.host}:${config.port}`);
  function shutdown() { server.close(); server.closeAllConnections(); }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) main().catch(error => { console.error(`Backend startup failed: ${error.message}`); process.exitCode = 1; });
module.exports = { main };
