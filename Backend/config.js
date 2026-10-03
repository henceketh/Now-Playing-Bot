const path = require('node:path');
const { required, port, httpUrl } = require('../config');

function loadConfig(env = process.env) {
  return {
    clientId: required(env, 'SPOTIFY_CLIENT_ID'),
    clientSecret: required(env, 'SPOTIFY_CLIENT_SECRET'),
    redirectUri: httpUrl(required(env, 'SPOTIFY_REDIRECT_URI')),
    host: env.HOST || '127.0.0.1',
    port: port(env.PORT, 3012),
    tokenFile: path.resolve(__dirname, env.TOKEN_FILE || 'spotify-tokens.json'),
    youtubeApiKey: required(env, 'YOUTUBE_API_KEY'),
    spDc: env.SP_DC,
    geniusToken: env.GENIUS_API_TOKEN,
  };
}

module.exports = { loadConfig };
