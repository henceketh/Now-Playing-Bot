const axios = require('axios');
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');

function createTrackService({ backendUrl, cacheDir }, http = axios) {
  const downloads = new Map();
  const fileFor = track => path.join(cacheDir, `${createHash('sha256').update(track.uri).digest('hex')}.mp3`);

  async function getTrackData() {
    const { data } = await http.get(`${backendUrl}/currently-playing`, { timeout: 8000, params: { lyrics: 'false' } });
    if (!data.uri) return null;
    if (!data.id || !data.song || !data.artist || !data.links?.spotify) throw new Error('Invalid track response');
    return { id: data.id, uri: data.uri, name: data.song, artist: data.artist, url: data.links.spotify };
  }

  async function getCachedAudio(track) {
    const file = fileFor(track);
    try {
      if ((await fs.stat(file)).size > 0) return file;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return null;
  }

  function downloadAndCacheAudio(track) {
    if (downloads.has(track.uri)) return downloads.get(track.uri);
    if (downloads.size >= 2) return Promise.reject(new Error('Download capacity reached'));
    const operation = (async () => {
      const cached = await getCachedAudio(track);
      if (cached) return cached;
      await fs.mkdir(cacheDir, { recursive: true });
      const file = fileFor(track);
      const temporary = `${file}.${randomUUID()}.tmp`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      try {
        const response = await http.get(`${backendUrl}/download-current-song`, {
          params: { track_id: track.id }, responseType: 'stream', timeout: 120000, signal: controller.signal,
        });
        await pipeline(response.data, createWriteStream(temporary), { signal: controller.signal });
        if (!(await fs.stat(temporary)).size) throw new Error('Empty audio response');
        await fs.rename(temporary, file);
        return file;
      } finally {
        clearTimeout(timer);
        await fs.rm(temporary, { force: true });
      }
    })().finally(() => downloads.delete(track.uri));
    downloads.set(track.uri, operation);
    return operation;
  }

  return { getTrackData, getCachedAudio, downloadAndCacheAudio };
}

module.exports = { createTrackService };
