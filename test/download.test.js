const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createTrackService } = require('../utils/download');
const { createDownloader } = require('../Backend/services/downloader');

const track = { id: '123', uri: 'spotify:track:123', song: 'Song', artist: 'Artist' };
async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-download-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('concurrent downloads share one request and subsequent calls reuse the cache', async t => {
  const cacheDir = await directory(t);
  let calls = 0;
  const service = createTrackService({ backendUrl: 'http://backend.test', cacheDir }, {
    get: async (url, options) => {
      calls++;
      assert.equal(options.params.track_id, track.id);
      return { data: Readable.from(['audio']) };
    },
  });
  const [first, second] = await Promise.all([service.downloadAndCacheAudio(track), service.downloadAndCacheAudio(track)]);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(await fs.readFile(first, 'utf8'), 'audio');
  await service.downloadAndCacheAudio(track);
  assert.equal(calls, 1);
  assert.deepEqual(await fs.readdir(cacheDir), [path.basename(first)]);
});

test('a broken source stream leaves no partial files and a retry can succeed', async t => {
  const cacheDir = await directory(t);
  let fail = true;
  const service = createTrackService({ backendUrl: 'http://backend.test', cacheDir }, {
    get: async () => ({ data: fail ? Readable.from((async function* () { yield 'partial'; throw new Error('stream broke'); })()) : Readable.from(['audio']) }),
  });
  await assert.rejects(service.downloadAndCacheAudio(track), /stream broke/);
  assert.deepEqual(await fs.readdir(cacheDir), []);
  assert.equal(await service.getCachedAudio(track), null);
  fail = false;
  assert.ok(await service.downloadAndCacheAudio(track));
});

test('downloader passes argument arrays, produces MP3 and removes the entire temp directory', async () => {
  let dir;
  const download = createDownloader('key', { get: async () => ({ data: { items: [{ id: { videoId: 'abcdefghijk' } }] } }) }, async (command, args, options) => {
    assert.equal(command, 'yt-dlp');
    assert.ok(args.includes('--no-playlist'));
    assert.equal(args.at(-2), '--');
    assert.equal(options.timeout, 90000);
    dir = path.dirname(args[args.indexOf('-o') + 1]);
    await fs.writeFile(path.join(dir, 'audio.mp3'), 'audio');
  });
  const result = await download(track);
  assert.equal(await fs.readFile(result.file, 'utf8'), 'audio');
  await result.cleanup();
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
});

test('empty YouTube search results fail before spawning a subprocess', async () => {
  const download = createDownloader('key', { get: async () => ({ data: { items: [] } }) }, () => { throw new Error('Should not run'); });
  await assert.rejects(download(track), /No matching/);
});

test('failed subprocess cleans its intermediate files', async () => {
  let dir;
  const download = createDownloader('key', { get: async () => ({ data: { items: [{ id: { videoId: 'abcdefghijk' } }] } }) }, async (command, args) => {
    dir = path.dirname(args[args.indexOf('-o') + 1]);
    await fs.writeFile(path.join(dir, 'audio.part'), 'partial');
    throw new Error('process timeout');
  });
  await assert.rejects(download(track), /process timeout/);
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
});
