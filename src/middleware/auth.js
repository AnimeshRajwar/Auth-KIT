const { hashApiKey } = require('../utils/tokens');
const { getCollection } = require('../db');

//authenticate via JWT Bearer token OR API Key header.

async function authenticate(request, reply) {
  const apiKey = request.headers['x-api-key'];

  if (apiKey) {
    // API Key auth
    const hashed = hashApiKey(apiKey);
    const apiKeys = await getCollection('api_keys');
    const users = await getCollection('users');

    const keyRecord = await apiKeys.findOne({ key_hash: hashed, revoked: false });
    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid or revoked API key' });
    }
    const user = await users.findOne({ id: keyRecord.user_id });
    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }
    // Update last used
    await apiKeys.updateOne(
      { key_hash: hashed },
      { $set: { last_used_at: new Date().toISOString() } }
    );
    request.user = { id: user.id, email: user.email };
    return;
  }

  // JWT auth (handled by @fastify/jwt)
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized', message: err.message });
  }
}

module.exports = { authenticate };
