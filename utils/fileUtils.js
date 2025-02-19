const fs = require('fs').promises;

/**
 * Ensures a directory exists. If not, creates it.
 * @param {string} dirPath 
 */
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (err) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

module.exports = {
  ensureDirectoryExists,
};