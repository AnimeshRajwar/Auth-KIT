const crypto = require('crypto');

/**
 * Generate a secure random API key with a prefix
 * e.g. "sk_a1b2c3d4e5f6..."
 */
function generateApiKey(prefix = 'sk') {
  const random = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${random}`;
}

/**
 * Hash an API key for storage (never store raw keys)
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

module.exports = { generateApiKey, hashApiKey };
