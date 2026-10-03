const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleGodCommand } = require('../bot/commands');
const { handleInlineQuery } = require('../bot/inlineQuery');

function context(id = 1) {
  const answers = [];
  return { from: { id }, answers, answerInlineQuery: async (...args) => { answers.push(args); } };
}
const track = { id: '123', uri: 'spotify:track:123', name: 'Song', artist: 'Artist', url: 'https://open.spotify.com/track/123' };
function handler(tracks, overrides = {}) {
  return handleInlineQuery({ isUserAuthorized: async () => true, allowedUserIds: [1], audioBaseUrl: 'https://example.test/audio', tracks, ...overrides });
}

test('/god cannot authorize someone outside the configured allowlist', async () => {
  let authorized = false;
  let message;
  await handleGodCommand(async () => { authorized = true; }, [1])({ from: { id: 2 }, reply: async text => { message = text; } });
  assert.equal(authorized, false);
  assert.match(message, /restricted/);
});

test('removed allowlisted users cannot use a previously saved authorization', async () => {
  const ctx = context(2);
  await handler({ getTrackData: () => { throw new Error('Should not fetch'); } })(ctx);
  assert.equal(ctx.answers[0][0][0].id, 'unauthorized');
  assert.equal(ctx.answers[0][1].is_personal, true);
});

test('cold queries answer immediately while audio preparation remains pending', async () => {
  let started = false;
  const ctx = context();
  await handler({
    getTrackData: async () => track, getCachedAudio: async () => null,
    downloadAndCacheAudio: () => { started = true; return new Promise(() => {}); },
  })(ctx);
  assert.equal(started, true);
  assert.equal(ctx.answers[0][0][0].type, 'article');
  assert.match(ctx.answers[0][0][0].input_message_content.message_text, /open.spotify.com/);
});

test('warm queries serve cached audio with a Telegram-safe ID', async () => {
  const ctx = context();
  await handler({ getTrackData: async () => track, getCachedAudio: async () => '/cache/abc.mp3' })(ctx);
  const result = ctx.answers[0][0][0];
  assert.equal(result.type, 'audio');
  assert.equal(result.id.length, 64);
  assert.equal(result.audio_url, 'https://example.test/audio/abc.mp3');
});

test('backend failures produce an inline answer, and Telegram failures are never retried', async () => {
  const ctx = context();
  await handler({ getTrackData: async () => { throw new Error('offline'); } })(ctx);
  assert.equal(ctx.answers[0][0][0].id, 'unavailable');
  let calls = 0;
  ctx.answerInlineQuery = async () => { calls++; throw new Error('expired query'); };
  await assert.rejects(handler({ getTrackData: async () => null })(ctx), /expired/);
  assert.equal(calls, 1);
});
