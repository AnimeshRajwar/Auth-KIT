const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getCollection } = require('../db');
const { authenticate } = require('../middleware/auth');
const { getProjectDb, evictProjectDb } = require('../db/project-db');
const { generateRefreshToken, hashRefreshToken, hashApiKey } = require('../utils/tokens');

async function projectAuthRoutes(fastify) {

  async function requireProjectApiKey(request, reply) {
    const { projectId } = request.params;
    const apiKey = request.headers['x-api-key'];
    const apiKeysCollection = await getCollection('api_keys');

    if (!apiKey || typeof apiKey !== 'string') {
      return reply.status(401).send({ error: 'x-api-key is required' });
    }

    const keyHash = hashApiKey(apiKey.trim());
    const keyRecord = await apiKeysCollection.findOne({
      key_hash: keyHash,
      revoked: false,
      project_id: projectId,
    });

    if (!keyRecord) {
      request.log.warn({ projectId }, 'Invalid project API key for project auth route');
      return reply.status(401).send({ error: 'Invalid or revoked API key for this project' });
    }
  }

  //resolve project and its db, or 404
  async function resolveProject(projectId, reply, request) {
    const projectsCollection = await getCollection('projects');
    const project = await projectsCollection.findOne({ id: projectId });
    if (!project) {
      if (request) {
        request.log.warn({ projectId }, 'Project not found while resolving project DB');
      }
      reply.status(404).send({ error: 'Project not found' });
      return null;
    }
    try {
      const pdb = await getProjectDb(project);
      return { project, pdb };
    } catch (err) {
      if (request) {
        request.log.error({
          projectId,
          dbUrlConfigured: !!project.db_url,
          dbType: project.db_type || null,
          error: err.message,
        }, 'Project DB resolution failed');
      }
      reply.status(503).send({ error: 'Database connection failed', detail: err.message });
      return null;
    }
  }

  //register
  fastify.post('/p/:projectId/auth/register', { preHandler: requireProjectApiKey }, async (request, reply) => {
    const { projectId } = request.params;
    const { email, password } = request.body || {};

    if (!email || !password) return reply.status(400).send({ error: 'email and password are required' });
    if (password.length < 8) return reply.status(400).send({ error: 'password must be at least 8 characters' });

    const ctx = await resolveProject(projectId, reply, request);
    if (!ctx) return;
    const { pdb } = ctx;

    const existing = await pdb.findUser({ email: email.toLowerCase() });
    if (existing) return reply.status(409).send({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: crypto.randomUUID(),
      project_id: projectId,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };

    await pdb.createUser(user);
    return reply.status(201).send({
      message: 'User registered successfully',
      user: { id: user.id, email: user.email },
    });
  });

  //login
  fastify.post('/p/:projectId/auth/login', { preHandler: requireProjectApiKey }, async (request, reply) => {
    const { projectId } = request.params;
    const { email, password } = request.body || {};

    if (!email || !password) return reply.status(400).send({ error: 'email and password are required' });

    const ctx = await resolveProject(projectId, reply, request);
    if (!ctx) return;
    const { pdb } = ctx;

    const user = await pdb.findUser({ email: email.toLowerCase() });
    if (!user) return reply.status(401).send({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.status(401).send({ error: 'Invalid email or password' });

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, project_id: projectId },
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
    );

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await pdb.createRefreshToken({
      token: refreshTokenHash,
      user_id: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

  //refresh
  fastify.post('/p/:projectId/auth/refresh', async (request, reply) => {
    const { projectId } = request.params;
    const { refresh_token } = request.body || {};
    if (!refresh_token) return reply.status(400).send({ error: 'refresh_token is required' });

    const ctx = await resolveProject(projectId, reply, request);
    if (!ctx) return;
    const { pdb } = ctx;

    const refreshTokenHash = hashRefreshToken(refresh_token);
    const record = await pdb.findRefreshToken(refreshTokenHash);
    if (!record) return reply.status(401).send({ error: 'Invalid refresh token' });
    if (new Date(record.expires_at) < new Date()) {
      await pdb.deleteRefreshToken(refreshTokenHash);
      return reply.status(401).send({ error: 'Refresh token expired' });
    }

    const user = await pdb.findUser({ id: record.user_id });
    if (!user) return reply.status(401).send({ error: 'User not found' });

    await pdb.deleteRefreshToken(refreshTokenHash);

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, project_id: projectId },
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
    );
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    await pdb.createRefreshToken({
      token: newRefreshTokenHash,
      user_id: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    return reply.send({ access_token: accessToken, refresh_token: newRefreshToken, token_type: 'Bearer' });
  });

  //logout
  fastify.post('/p/:projectId/auth/logout', async (request, reply) => {
    const { projectId } = request.params;
    const { refresh_token } = request.body || {};
    if (!refresh_token) return reply.status(400).send({ error: 'refresh_token is required' });

    const ctx = await resolveProject(projectId, reply, request);
    if (!ctx) return;
    const refreshTokenHash = hashRefreshToken(refresh_token);
    await ctx.pdb.deleteRefreshToken(refreshTokenHash);
    return reply.send({ message: 'Logged out successfully' });
  });

  // me
  fastify.get('/p/:projectId/auth/me', async (request, reply) => {
    const { projectId } = request.params;

    // Accept Bearer JWT
    let userId;
    try {
      await request.jwtVerify();
      userId = request.user.id;
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const ctx = await resolveProject(projectId, reply, request);
    if (!ctx) return;

    const user = await ctx.pdb.findUser({ id: userId });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    return reply.send({ user: { id: user.id, email: user.email, created_at: user.created_at } });
  });

  // user count (for dashboard stats)
  fastify.get('/p/:projectId/stats', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.user.id;
    const projectsCollection = await getCollection('projects');

    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    try {
      const pdb = await getProjectDb(project);
      const userCount = await pdb.countUsers();
      return reply.send({ user_count: userCount });
    } catch (err) {
      request.log.warn({
        projectId,
        dbUrlConfigured: !!project.db_url,
        dbType: project.db_type || null,
        error: err.message,
      }, 'Failed to load project user stats due to DB issue');
      return reply.send({ user_count: null, error: 'DB not reachable' });
    }
  });

  // test DB connection
  fastify.post('/p/:projectId/db/test', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.user.id;
    const { db_url } = request.body || {};
    const projectsCollection = await getCollection('projects');

    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const testUrl = typeof db_url === 'string' ? db_url.trim() : '';
    if (!testUrl) {
      return reply.status(400).send({ ok: false, message: 'db_url is required for testing' });
    }

    try {
      // test candidate URL without persisting it on the project
      evictProjectDb(projectId);
      const candidateProject = { ...project, db_url: testUrl };
      const pdb = await getProjectDb(candidateProject);
      await pdb.testConnection();
      evictProjectDb(projectId);
      return reply.send({ ok: true, type: pdb.type, message: 'Connection successful' });
    } catch (err) {
      request.log.warn({ projectId, error: err.message }, 'Project DB connection test failed');
      evictProjectDb(projectId);
      return reply.status(400).send({ ok: false, message: err.message });
    }
  });
}

module.exports = projectAuthRoutes;
