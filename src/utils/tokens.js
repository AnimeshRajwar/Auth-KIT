const crypto = require('crypto');

function generateApiKey(prefix = 'sk') {
  const random = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${random}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { generateApiKey, hashApiKey, generateRefreshToken, hashRefreshToken };
