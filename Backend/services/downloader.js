const axios = require('axios');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

function createDownloader(apiKey, http = axios, run = promisify(execFile)) {
  let active = 0;
  return async function download(track) {
    if (active >= 2) {
      const error = new Error('Download capacity reached');
      error.status = 503;
      throw error;
    }
    active++;
    let directory;
    try {
      const { data } = await http.get('https://www.googleapis.com/youtube/v3/search', {
        params: { part: 'snippet', type: 'video', maxResults: 1, q: `${track.song} ${track.artist}`, key: apiKey },
        timeout: 10000,
      });
      const videoId = data.items?.[0]?.id?.videoId;
      if (!videoId || !/^[\w-]{11}$/.test(videoId)) throw new Error('No matching YouTube video found');
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'now-playing-'));
      const file = path.join(directory, 'audio.mp3');
      await run('yt-dlp', [
        '--no-playlist', '--no-progress', '--max-filesize', '50M', '-x', '--audio-format', 'mp3',
        '-o', path.join(directory, 'audio.%(ext)s'), '--', `https://www.youtube.com/watch?v=${videoId}`,
      ], { timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true });
      const { size } = await fs.stat(file);
      if (!size || size > 50 * 1024 * 1024) throw new Error('Audio file is empty or too large');
      return { file, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      if (directory) await fs.rm(directory, { recursive: true, force: true });
      throw error;
    } finally {
      active--;
    }
  };
}

module.exports = { createDownloader };
