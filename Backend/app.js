const express = require('express');
const { randomBytes, timingSafeEqual } = require('node:crypto');

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

function createApp({ api, spotify, downloader, lyrics, secureCookie = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  function login(req, res) {
    const state = randomBytes(32).toString('hex');
    res.cookie('spotify_state', state, { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 600000 });
    res.redirect(api.createAuthorizeURL(['user-read-playback-state', 'user-read-currently-playing'], state));
  }
  app.get('/login', login);
  app.get('/mazafakatospotik', login);
  app.get('/callback', asyncRoute(async (req, res) => {
    const cookieState = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('spotify_state='))?.slice(14);
    const state = req.query.state;
    res.clearCookie('spotify_state', { httpOnly: true, sameSite: 'lax', secure: secureCookie });
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || !cookieState || !/^[a-f0-9]{64}$/.test(cookieState) ||
        !timingSafeEqual(Buffer.from(cookieState), Buffer.from(state))) {
      return res.status(400).json({ message: 'Invalid OAuth state. Start again at /login.' });
    }
    if (req.query.error || typeof req.query.code !== 'string' || !req.query.code) return res.status(400).json({ message: 'Spotify authorization was denied or incomplete.' });
    await spotify.authorize(req.query.code);
    res.send('Spotify connected. You can return to Telegram.');
  }));

  app.get('/currently-playing', asyncRoute(async (req, res) => {
    const start = Date.now();
    const track = await spotify.getCurrentTrack();
    const dataTime = Date.now() - start;
    if (!track) return res.json({ message: 'No song is currently playing' });
    const lyricsStart = Date.now();
    const result = req.query.lyrics === 'false' ? { lyrics: { syncType: 'UNSYNCED', lines: [] }, geniusUrl: '' } : await lyrics.getLyrics(track);
    const lyricsTime = Date.now() - lyricsStart;
    res.json({
      ...track, links: { ...track.links, genius: result.geniusUrl }, lyrics: result.lyrics,
      delay: { data: dataTime, lyrics: lyricsTime, external_lyrics: 0, total: Date.now() - start },
      timing: { data_fetch_duration: dataTime, lyrics_fetch_duration: lyricsTime, genius_fetch_duration: 0, total_duration: Date.now() - start },
    });
  }));

  app.get('/download-current-song', asyncRoute(async (req, res) => {
    const track = await spotify.getCurrentTrack();
    if (!track) return res.status(404).json({ message: 'No song is currently playing' });
    if (req.query.track_id && req.query.track_id !== track.id) return res.status(409).json({ message: 'Track changed. Query again.' });
    const download = await downloader(track);
    if (res.destroyed) { await download.cleanup(); return; }
    // Header values must be ASCII; Unicode names are preserved in the JSON API.
    res.set('X-Song-Name', encodeURIComponent(track.song));
    res.set('X-Artist-Name', encodeURIComponent(track.artist));
    try {
      res.download(download.file, `${track.id}.mp3`, error => {
        download.cleanup().catch(() => console.error('Temporary audio cleanup failed.'));
        if (error && !res.headersSent && !res.destroyed) res.status(500).end();
      });
    } catch (error) {
      await download.cleanup();
      throw error;
    }
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const upstream = error.statusCode || error.response?.status;
    const status = error.status || (upstream === 429 ? 429 : upstream === 401 ? 401 : 502);
    if (status === 429) {
      const retryAfter = error.headers?.['retry-after'] || error.response?.headers?.['retry-after'];
      if (retryAfter) res.set('Retry-After', String(retryAfter));
    }
    console.error(`Backend request failed (${status}).`);
    res.status(status).json({ message: status === 401 ? 'Authorize Spotify at /login.' : 'Service temporarily unavailable. Please try again.' });
  });
  return app;
}

module.exports = { createApp };
