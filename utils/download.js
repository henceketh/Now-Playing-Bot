const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generates a random filename for the audio file.
 * @returns {string}
 */
const generateRandomFilename = () => {
  return `track_${Math.random().toString(36).substring(2, 15)}.mp3`;
};

/**
 * Retrieves track data. Replace with actual implementation.
 * @returns {Promise<Object>}
 */
const getTrackData = async () => {
  // Replace this mock data with actual implementation
  return {
    uri: 'track_uri',
    name: 'Audio Track',
    artist: 'Artist Name',
    platform: 'spotify',
    song_link: "http://localhost:3012/download-current-song",
  };
};

/**
 * Downloads and caches the audio track.
 * @param {Object} track 
 * @returns {Promise<string>} - Path to the cached audio file.
 */
const downloadAndCacheAudio = async (track) => {
  try {
    const response = await axios.get(track.song_link, { responseType: 'stream' });

    const songName = response.headers['x-song-name'] || 'Unknown Song';
    const artistName = response.headers['x-artist-name'] || 'Unknown Artist';

    track.name = songName;
    track.artist = artistName;

    const fileName = generateRandomFilename();
    const filePath = path.join(__dirname, '..', process.env.CACHE_DIR || 'cache', fileName);
    const writer = response.data.pipe(require('fs').createWriteStream(filePath));

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading audio:', error);
    throw error;
  }
};

module.exports = {
  getTrackData,
  downloadAndCacheAudio,
};