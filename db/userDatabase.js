const { readJson, writeJson } = require('../utils/fileUtils');

function createUserDatabase(file) {
  let pending = Promise.resolve();

  async function load() {
    const data = await readJson(file, { authorized_users: [] });
    if (!Array.isArray(data.authorized_users) || data.authorized_users.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('Invalid user database');
    }
    return data;
  }

  function authorizeUser(userId) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return Promise.reject(new Error('Invalid user ID'));
    const operation = pending.then(async () => {
      const data = await load();
      if (!data.authorized_users.includes(userId)) {
        data.authorized_users.push(userId);
        await writeJson(file, data);
      }
    });
    pending = operation.catch(() => {});
    return operation;
  }

  async function isUserAuthorized(userId) {
    await pending;
    return (await load()).authorized_users.includes(userId);
  }

  return { authorizeUser, isUserAuthorized };
}

module.exports = { createUserDatabase };
