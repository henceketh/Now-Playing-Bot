const { readJson, writeJson } = require('../../utils/fileUtils');

function normalizePlayback(body) {
  const track = body?.item;
  if (!body?.is_playing || !track || track.type !== 'track' || !track.id) return null;
  const duration = track.duration_ms || 0;
  const progress = body.progress_ms || 0;
  return {
    id: track.id,
    uri: track.uri,
    song: track.name,
    artist: track.artists.map(artist => artist.name).join(', '),
    album: track.album?.name || '',
    song_image: track.album?.images?.[0]?.url || null,
    links: { spotify: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`, genius: '' },
    playback: {
      progress_ms: progress, duration_ms: duration,
      progress_percentage: duration ? Math.min(100, Math.max(0, Math.floor(progress / duration * 100))) : 0,
    },
  };
}

function createSpotifyService(api, tokenFile) {
  let expiresAt = 0;
  let refreshing;
  let saving = Promise.resolve();

  async function load() {
    const tokens = await readJson(tokenFile, null);
    if (!tokens) return;
    if (!tokens.refresh_token || typeof tokens.refresh_token !== 'string') throw new Error('Invalid Spotify token file; authorize again');
    api.setAccessToken(tokens.access_token);
    api.setRefreshToken(tokens.refresh_token);
    expiresAt = tokens.expires_at || 0;
  }

  async function save(body) {
    const refreshToken = body.refresh_token || api.getRefreshToken();
    if (!body.access_token || !refreshToken || !Number.isFinite(body.expires_in)) throw new Error('Invalid Spotify token response');
    const tokens = {
      access_token: body.access_token, refresh_token: refreshToken,
      expires_at: Date.now() + body.expires_in * 1000,
    };
    const operation = saving.then(() => writeJson(tokenFile, tokens));
    saving = operation.catch(() => {});
    await operation;
    api.setAccessToken(tokens.access_token);
    api.setRefreshToken(tokens.refresh_token);
    expiresAt = tokens.expires_at;
  }

  function refresh() {
    if (!api.getRefreshToken()) {
      const error = new Error('Authorize Spotify at /login first');
      error.status = 401;
      return Promise.reject(error);
    }
    if (!refreshing) {
      refreshing = api.refreshAccessToken().then(data => save(data.body)).finally(() => { refreshing = undefined; });
    }
    return refreshing;
  }

  async function getCurrentTrack() {
    if (!api.getAccessToken() || Date.now() >= expiresAt - 30000) await refresh();
    let response;
    try {
      response = await api.getMyCurrentPlaybackState();
    } catch (error) {
      if ((error.statusCode || error.response?.status) !== 401) throw error;
      await refresh();
      response = await api.getMyCurrentPlaybackState();
    }
    return normalizePlayback(response.body);
  }

  async function authorize(code) {
    // Avoid an old in-flight refresh overwriting tokens from a new login.
    if (refreshing) await refreshing.catch(() => {});
    await save((await api.authorizationCodeGrant(code)).body);
  }

  return { load, getCurrentTrack, authorize };
}

module.exports = { createSpotifyService, normalizePlayback };
