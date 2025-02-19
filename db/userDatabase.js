const fs = require('fs').promises;
const path = require('path');

const USER_DB_PATH = path.join(__dirname, '..', process.env.USER_DB || 'users.json');

/**
 * Loads the user database. If it doesn't exist, initializes it.
 */
const loadUserDatabase = async () => {
  try {
    await fs.access(USER_DB_PATH);
  } catch (err) {
    const initialData = { authorized_users: [] };
    await fs.writeFile(USER_DB_PATH, JSON.stringify(initialData, null, 2));
  }

  const data = await fs.readFile(USER_DB_PATH, 'utf8');
  return JSON.parse(data);
};

/**
 * Saves the user database.
 * @param {Object} data 
 */
const saveUserDatabase = async (data) => {
  await fs.writeFile(USER_DB_PATH, JSON.stringify(data, null, 2));
};

/**
 * Checks if a user is authorized.
 * @param {number} userId 
 * @returns {Promise<boolean>}
 */
const isUserAuthorized = async (userId) => {
  const db = await loadUserDatabase();
  return db.authorized_users.includes(userId);
};

/**
 * Authorizes a user by adding them to the database.
 * @param {number} userId 
 */
const authorizeUser = async (userId) => {
  const db = await loadUserDatabase();
  if (!db.authorized_users.includes(userId)) {
    db.authorized_users.push(userId);
    await saveUserDatabase(db);
  }
};

module.exports = {
  isUserAuthorized,
  authorizeUser,
};