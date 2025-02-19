const { getTrackData, downloadAndCacheAudio } = require('../utils/download');
const path = require('path');

/**
 * Handles inline queries from users.
 * @param {Function} isUserAuthorized - Function to check user authorization.
 * @returns {Function} - Telegraf inline query handler.
 */
const handleInlineQuery = (isUserAuthorized) => {
  return async (ctx) => {
    try {
      const userId = ctx.from.id;

      if (!await isUserAuthorized(userId)) {
        const unauthorizedResult = [{
          type: 'article',
          id: 'unauthorized',
          title: 'Authorization Required',
          input_message_content: {
            message_text: 'Please authorize first to fetch songs.',
          },
        }];
        return ctx.answerInlineQuery(unauthorizedResult, { cache_time: 1 });
      }

      const track = await getTrackData();
      if (!track) {
        const noTrackResult = [{
          type: 'article',
          id: 'no_track',
          title: 'No Track Found',
          input_message_content: {
            message_text: 'No track information found.',
          },
        }];
        return ctx.answerInlineQuery(noTrackResult, { cache_time: 1 });
      }

      const audioFile = await downloadAndCacheAudio(track);
      const audioUrl = `${process.env.AUDIO_BASE_URL}/${path.basename(audioFile)}`;

      const results = [{
        type: 'audio',
        id: track.uri,
        audio_url: audioUrl,
        title: `${track.artist} - ${track.name}`,
        parse_mode: 'HTML',
      }];

      await ctx.answerInlineQuery(results, { cache_time: 1 });
    } catch (error) {
      console.error('Error handling inline query:', error);
    }
  };
};

module.exports = {
  handleInlineQuery,
};