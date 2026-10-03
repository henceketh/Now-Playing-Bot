const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSpotifyService, normalizePlayback } = require('../Backend/services/spotify');
const { createSpotifyClient } = require('../Backend/services/spotifyClient');

const playback = { is_playing: true, progress_ms: 500, item: { type: 'track', id: '123', uri: 'spotify:track:123', name: 'Песня', artists: [{ name: 'Исполнитель' }], duration_ms: 1000 } };

test('normalizes sparse tracks and handles no playback, paused playback and episodes', () => {
  for (const body of [undefined, '', {}, { is_playing: true, item: null }, { ...playback, is_playing: false }, { is_playing: true, item: { type: 'episode' } }]) {
    assert.equal(normalizePlayback(body), null);
  }
  const track = normalizePlayback(playback);
  assert.equal(track.song_image, null);
  assert.equal(track.playback.progress_percentage, 50);
  assert.equal(track.song, 'Песня');
});

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-spotify-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'tokens.json');
  let accessToken;
  let refreshToken;
  const api = {
    setAccessToken: value => { accessToken = value; }, getAccessToken: () => accessToken,
    setRefreshToken: value => { refreshToken = value; }, getRefreshToken: () => refreshToken,
    getMyCurrentPlaybackState: async () => ({ body: playback }),
  };
  return { file, api };
}

test('expired tokens refresh once for concurrent requests and persist the new token', async t => {
  const { file, api } = await fixture(t);
  await fs.writeFile(file, JSON.stringify({ access_token: 'old', refresh_token: 'refresh', expires_at: 1 }));
  let count = 0;
  api.refreshAccessToken = async () => {
    count++;
    return { body: { access_token: 'new', expires_in: 3600 } };
  };
  const spotify = createSpotifyService(api, file);
  await spotify.load();
  await Promise.all([spotify.getCurrentTrack(), spotify.getCurrentTrack()]);
  assert.equal(count, 1);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.access_token, 'new');
  assert.equal(saved.refresh_token, 'refresh');
  assert.ok(saved.expires_at > Date.now());
});

test('a revoked access token retries once; non-auth errors do not refresh', async t => {
  const { file, api } = await fixture(t);
  await fs.writeFile(file, JSON.stringify({ access_token: 'old', refresh_token: 'refresh', expires_at: Date.now() + 3600000 }));
  let count = 0;
  let calls = 0;
  api.refreshAccessToken = async () => { count++; return { body: { access_token: 'new', refresh_token: 'rotated', expires_in: 3600 } }; };
  api.getMyCurrentPlaybackState = async () => {
    if (++calls === 1) throw { response: { status: 401 } };
    return { body: playback };
  };
  const spotify = createSpotifyService(api, file);
  await spotify.load();
  assert.equal((await spotify.getCurrentTrack()).id, '123');
  assert.equal(count, 1);
  assert.equal(api.getRefreshToken(), 'rotated');
  api.getMyCurrentPlaybackState = async () => { throw { response: { status: 429 } }; };
  await assert.rejects(spotify.getCurrentTrack(), error => error.response.status === 429);
  assert.equal(count, 1);
});

test('missing authorization fails clearly instead of requesting playback', async t => {
  const { file, api } = await fixture(t);
  const spotify = createSpotifyService(api, file);
  await spotify.load();
  await assert.rejects(spotify.getCurrentTrack(), error => error.status === 401);
});

test('Spotify HTTP adapter encodes OAuth parameters and bounds network calls', async () => {
  const calls = [];
  const http = {
    post: async (...args) => { calls.push(args); return { data: { access_token: 'test' } }; },
    get: async (...args) => { calls.push(args); return { data: '' }; },
  };
  const api = createSpotifyClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://127.0.0.1/callback' }, http);
  assert.equal(new URL(api.createAuthorizeURL(['a', 'b'], 'state')).searchParams.get('state'), 'state');
  await api.authorizationCodeGrant('a&b');
  assert.equal(new URLSearchParams(calls[0][1]).get('code'), 'a&b');
  api.setAccessToken('access');
  await api.getMyCurrentPlaybackState();
  assert.equal(calls[1][1].headers.Authorization, 'Bearer access');
  assert.equal(calls[1][1].timeout, 5000);
});
