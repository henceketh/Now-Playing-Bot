const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../Backend/app');
const { createLyricsService } = require('../Backend/services/lyrics');

const track = { id: '123', uri: 'spotify:track:123', song: 'Песня', artist: 'Исполнитель', links: { spotify: 'https://open.spotify.com/track/123' } };
async function server(t, overrides = {}) {
  const services = {
    api: { createAuthorizeURL: (scopes, state) => `https://accounts.spotify.com/authorize?state=${state}` },
    spotify: { getCurrentTrack: async () => track, authorize: async () => {} },
    downloader: async () => { throw new Error('unexpected download'); },
    lyrics: { getLyrics: async () => ({ lyrics: { lines: [] }, geniusUrl: '' }) },
    ...overrides,
  };
  const listener = createApp(services).listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  return `http://127.0.0.1:${listener.address().port}`;
}

test('metadata endpoint preserves Unicode and can skip optional lyrics', async t => {
  const base = await server(t, { lyrics: { getLyrics: () => { throw new Error('Should not fetch lyrics'); } } });
  const response = await fetch(`${base}/currently-playing?lyrics=false`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.song, 'Песня');
  assert.equal(body.uri, track.uri);
  assert.deepEqual(body.lyrics.lines, []);
});

test('no playback returns an empty state and downloading returns 404', async t => {
  const base = await server(t, { spotify: { getCurrentTrack: async () => null } });
  assert.equal((await fetch(`${base}/download-current-song`)).status, 404);
  assert.equal((await (await fetch(`${base}/currently-playing`)).json()).uri, undefined);
});

test('track changes cannot put the wrong audio in a cached track file', async t => {
  const base = await server(t);
  assert.equal((await fetch(`${base}/download-current-song?track_id=other`)).status, 409);
});

test('OAuth rejects mismatched state and accepts a callback tied to the login cookie', async t => {
  let code;
  const base = await server(t, { spotify: { authorize: async value => { code = value; } } });
  const login = await fetch(`${base}/login`, { redirect: 'manual' });
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${base}/callback?code=test&state=${state}`)).status, 400);
  assert.equal((await fetch(`${base}/callback?code=test&state=${'0'.repeat(64)}`, { headers: { Cookie: cookie } })).status, 400);
  assert.equal(code, undefined);
  const response = await fetch(`${base}/callback?code=test&state=${state}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(code, 'test');
});

test('async upstream errors return safe JSON and preserve rate-limit headers', async t => {
  const base = await server(t, { spotify: { getCurrentTrack: async () => { throw { response: { status: 429, headers: { 'retry-after': '5' }, data: 'secret' } }; } } });
  const response = await fetch(`${base}/currently-playing`);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.doesNotMatch(await response.text(), /secret/);
});

test('download route sends a real file and invokes cleanup after transfer', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-route-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'audio.mp3');
  await fs.writeFile(file, 'audio');
  let finishCleanup;
  const cleaned = new Promise(resolve => { finishCleanup = resolve; });
  const base = await server(t, { downloader: async () => ({ file, cleanup: async () => { await fs.rm(file); finishCleanup(); } }) });
  const response = await fetch(`${base}/download-current-song?track_id=123`);
  assert.equal(response.status, 200);
  assert.equal(decodeURIComponent(response.headers.get('x-song-name')), track.song);
  assert.equal(await response.text(), 'audio');
  await cleaned;
  await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('lyrics failures are optional and web tokens are reused until expiration', async () => {
  let tokens = 0;
  const lyrics = createLyricsService({ spDc: 'cookie' }, { get: async url => {
    if (url.includes('get_access_token')) { tokens++; return { data: { accessToken: 'test', accessTokenExpirationTimestampMs: Date.now() + 3600000 } }; }
    return { data: { lyrics: { lines: [{ words: 'hello' }] } } };
  } });
  await lyrics.getLyrics(track);
  await lyrics.getLyrics(track);
  assert.equal(tokens, 1);
  const unavailable = createLyricsService({ spDc: 'cookie', geniusToken: 'token' }, { get: async () => { throw new Error('offline'); } });
  assert.deepEqual((await unavailable.getLyrics(track)).lyrics.lines, []);
});
