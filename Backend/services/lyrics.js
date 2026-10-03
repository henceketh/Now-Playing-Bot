const axios = require('axios');
const cheerio = require('cheerio');

function createLyricsService({ spDc, geniusToken }, http = axios) {
  let token;
  let tokenRequest;

  async function getToken() {
    if (token?.accessToken && token.accessTokenExpirationTimestampMs > Date.now() + 30000) return token.accessToken;
    if (!tokenRequest) {
      tokenRequest = http.get('https://open.spotify.com/get_access_token', {
        params: { reason: 'transport', productType: 'web_player' }, timeout: 5000,
        headers: { Cookie: `sp_dc=${spDc};`, 'App-platform': 'WebPlayer', 'User-Agent': 'Mozilla/5.0' },
      }).then(({ data }) => {
        if (data.isAnonymous || !data.accessToken) throw new Error('Invalid Spotify lyrics cookie');
        token = data;
        return token.accessToken;
      }).finally(() => { tokenRequest = undefined; });
    }
    return tokenRequest;
  }

  async function getLyrics(track) {
    if (spDc) {
      try {
        const accessToken = await getToken();
        const { data } = await http.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${encodeURIComponent(track.id)}`, {
          params: { format: 'json', market: 'from_token' }, timeout: 5000,
          headers: { Authorization: `Bearer ${accessToken}`, 'App-platform': 'WebPlayer' },
        });
        if (data.lyrics) return { lyrics: data.lyrics, geniusUrl: '' };
      } catch { token = undefined; }
    }
    if (geniusToken) {
      try {
        const { data } = await http.get('https://api.genius.com/search', {
          params: { q: `${track.song} ${track.artist}` }, timeout: 5000,
          headers: { Authorization: `Bearer ${geniusToken}` },
        });
        const url = data.response?.hits?.[0]?.result?.url;
        if (url && new URL(url).origin === 'https://genius.com') {
          const page = await http.get(url, { timeout: 5000 });
          const $ = cheerio.load(page.data);
          const lines = [];
          $('[data-lyrics-container=true]').each((_, element) => {
            $(element).find('br').replaceWith('\n');
            lines.push(...$(element).text().split('\n').map(line => line.trim()).filter(Boolean));
          });
          if (lines.length) return {
            lyrics: { syncType: 'UNSYNCED', lines: lines.map(words => ({ words, startTimeMs: '0', endTimeMs: '0', syllables: [] })) },
            geniusUrl: url,
          };
        }
      } catch { /* Optional provider failures must not break playback. */ }
    }
    return { lyrics: { syncType: 'UNSYNCED', lines: [] }, geniusUrl: '' };
  }

  return { getLyrics };
}

module.exports = { createLyricsService };
