const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getCollection } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateApiKey, hashApiKey, generateRefreshToken, hashRefreshToken } = require('../utils/tokens');

async function authRoutes(fastify) {
  // ─── Register ────────────────────────────────────────────────────────────────
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const users = await getCollection('users');

    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };

    await users.insertOne(user);

    return reply.status(201).send({
      message: 'User registered successfully',
      user: { id: user.id, email: user.email },
    });
  });

  // ─── Login ───────────────────────────────────────────────────────────────────
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const users = await getCollection('users');
    const refreshTokens = await getCollection('refresh_tokens');

    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email },
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
    );

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    await refreshTokens.insertOne({
      token: refreshTokenHash,
      user_id: user.id,
      expires_at: refreshExpiry,
      created_at: new Date().toISOString(),
    });

    return reply.send({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: process.env.ACCESS_TOKEN_EXPIRY || '15m',
      user: { id: user.id, email: user.email },
    });
  });

  // ─── Refresh Token ───────────────────────────────────────────────────────────
  fastify.post('/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: { refresh_token: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { refresh_token } = request.body;
    const users = await getCollection('users');
    const refreshTokens = await getCollection('refresh_tokens');

    const refreshTokenHash = hashRefreshToken(refresh_token);
    const record = await refreshTokens.findOne({ token: refreshTokenHash });
    if (!record) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
    if (new Date(record.expires_at) < new Date()) {
      await refreshTokens.deleteOne({ token: refreshTokenHash });
      return reply.status(401).send({ error: 'Refresh token expired' });
    }

    const user = await users.findOne({ id: record.user_id });
    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    // Rotate: delete old, issue new
    await refreshTokens.deleteOne({ token: refreshTokenHash });

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email },
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
    );
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await refreshTokens.insertOne({
      token: newRefreshTokenHash,
      user_id: user.id,
      expires_at: refreshExpiry,
      created_at: new Date().toISOString(),
    });

    return reply.send({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
    });
  });

  // ─── Logout ──────────────────────────────────────────────────────────────────
  fastify.post('/auth/logout', {
    schema: {
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: { refresh_token: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { refresh_token } = request.body;
    const refreshTokens = await getCollection('refresh_tokens');
    const refreshTokenHash = hashRefreshToken(refresh_token);
    await refreshTokens.deleteOne({ token: refreshTokenHash });
    return reply.send({ message: 'Logged out successfully' });
  });

  // ─── Me (protected) ──────────────────────────────────────────────────────────
  fastify.get('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const users = await getCollection('users');
    const apiKeysCollection = await getCollection('api_keys');

    const user = await users.findOne({ id: userId });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const apiKeys = await apiKeysCollection.find({ user_id: userId, revoked: false })
      .project({ _id: 0, id: 1, name: 1, created_at: 1, last_used_at: 1 })
      .toArray();

    return reply.send({
      user: { id: user.id, email: user.email, created_at: user.created_at },
      api_keys: apiKeys,
    });
  });

  // ─── Create API Key (protected) ───────────────────────────────────────────────
  fastify.post('/auth/api-keys', { preHandler: authenticate }, async (request, reply) => {
    const { name } = request.body || {};
    const userId = request.user.id;
    const apiKeysCollection = await getCollection('api_keys');

    const rawKey = generateApiKey('sk');
    const keyHash = hashApiKey(rawKey);

    const keyRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: name || 'Default',
      key_hash: keyHash,
      revoked: false,
      created_at: new Date().toISOString(),
      last_used_at: null,
    };

    await apiKeysCollection.insertOne(keyRecord);

    // Raw key returned ONCE — never shown again
    return reply.status(201).send({
      message: 'API key created. Store it securely — it will not be shown again.',
      api_key: rawKey,
      id: keyRecord.id,
      name: keyRecord.name,
    });
  });

  // ─── Revoke API Key (protected) ───────────────────────────────────────────────
  fastify.delete('/auth/api-keys/:keyId', { preHandler: authenticate }, async (request, reply) => {
    const { keyId } = request.params;
    const userId = request.user.id;
    const apiKeysCollection = await getCollection('api_keys');

    const key = await apiKeysCollection.findOne({ id: keyId, user_id: userId });
    if (!key) return reply.status(404).send({ error: 'API key not found' });

    await apiKeysCollection.updateOne({ id: keyId }, { $set: { revoked: true } });
    return reply.send({ message: 'API key revoked' });
  });
}

module.exports = authRoutes;
