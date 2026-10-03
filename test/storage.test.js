const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createUserDatabase } = require('../db/userDatabase');
const { loadConfig } = require('../config');

test('concurrent authorization keeps every user and deduplicates IDs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-users-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'nested', 'users.json');
  const db = createUserDatabase(file);
  await Promise.all([1, 2, 1, 3].map(db.authorizeUser));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).authorized_users, [1, 2, 3]);
  assert.equal(await db.isUserAuthorized(4), false);
  assert.equal(await db.isUserAuthorized(2), true);
});

test('a corrupt database is reported and never overwritten', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-users-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'users.json');
  await fs.writeFile(file, '{invalid');
  await assert.rejects(createUserDatabase(file).authorizeUser(1), /Cannot read JSON/);
  assert.equal(await fs.readFile(file, 'utf8'), '{invalid');
});

test('configuration rejects missing allowlist, invalid ports and non-HTTP URLs', () => {
  const env = { BOT_TOKEN: 'test', AUDIO_BASE_URL: 'https://example.test/audio', ALLOWED_USER_IDS: '1, 2' };
  assert.deepEqual(loadConfig(env).allowedUserIds, [1, 2]);
  assert.throws(() => loadConfig({ ...env, ALLOWED_USER_IDS: '' }), /ALLOWED_USER_IDS/);
  assert.throws(() => loadConfig({ ...env, PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ ...env, AUDIO_BASE_URL: 'file:///cache' }), /HTTP/);
});
