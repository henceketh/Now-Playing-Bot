const path = require('node:path');
const { createHash } = require('node:crypto');

const options = { cache_time: 1, is_personal: true };
const article = (id, title, text) => ({ type: 'article', id, title, input_message_content: { message_text: text } });

function handleInlineQuery({ isUserAuthorized, allowedUserIds, tracks, audioBaseUrl }) {
  return async ctx => {
    let results;
    try {
      if (!allowedUserIds.includes(ctx.from.id) || !await isUserAuthorized(ctx.from.id)) {
        results = [article('unauthorized', 'Authorization required', 'Ask the bot owner for access, then use /god.')];
      } else {
        const track = await tracks.getTrackData();
        if (!track) {
          results = [article('no_track', 'Nothing is playing', 'No Spotify track is currently playing.')];
        } else {
          const audio = await tracks.getCachedAudio(track);
          const id = createHash('sha256').update(track.uri).digest('hex');
          if (audio) {
            results = [{ type: 'audio', id, audio_url: `${audioBaseUrl}/${path.basename(audio)}`, title: track.name, performer: track.artist }];
          } else {
            tracks.downloadAndCacheAudio(track).catch(() => console.error('Audio preparation failed; retry the inline query.'));
            results = [article(id, `${track.artist} - ${track.name}`, `${track.artist} - ${track.name}\n${track.url}`)];
            results[0].description = 'Preparing audio. Query again shortly to send the MP3.';
          }
        }
      }
    } catch {
      console.error('Could not fetch the current track.');
      results = [article('unavailable', 'Service temporarily unavailable', 'Please try again shortly.')];
    }
    await ctx.answerInlineQuery(results, options);
  };
}

module.exports = { handleInlineQuery };
