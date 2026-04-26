const crypto = require('crypto');
const { getCollection } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateApiKey, hashApiKey } = require('../utils/tokens');
const { evictProjectDb, detectDbType } = require('../db/project-db');

async function projectRoutes(fastify) {

  // List Projects
  fastify.get('/projects', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const projectsCollection = await getCollection('projects');
    const apiKeysCollection = await getCollection('api_keys');
    const projects = await projectsCollection.find({ user_id: userId }).toArray();

    const projectsWithCounts = await Promise.all(projects.map(async (p) => {
      const keyCount = await apiKeysCollection.countDocuments({ project_id: p.id, revoked: false });
      return { ...p, key_count: keyCount };
    }));

    return reply.send({ projects: projectsWithCounts });
  });

  // Create Project
  fastify.post('/projects', { preHandler: authenticate }, async (request, reply) => {
    const { name, description, db_url } = request.body || {};
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Project name is required' });
    }
    const userId = request.user.id;
    const project = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: name.trim(),
      description: description ? description.trim() : '',
      db_url: db_url ? db_url.trim() : null,
      db_type: detectDbType(db_url ? db_url.trim() : null),
      created_at: new Date().toISOString(),
    };
    const projectsCollection = await getCollection('projects');
    await projectsCollection.insertOne(project);
    return reply.status(201).send({ project });
  });

  // Get Project
  fastify.get('/projects/:projectId', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.user.id;
    const projectsCollection = await getCollection('projects');
    const apiKeysCollection = await getCollection('api_keys');

    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const apiKeys = await apiKeysCollection.find({ project_id: projectId })
      .project({ _id: 0, id: 1, name: 1, prefix: 1, type: 1, revoked: 1, created_at: 1, last_used_at: 1 })
      .toArray();

    return reply.send({ project, api_keys: apiKeys });
  });

  // Update Project
  fastify.patch('/projects/:projectId', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.user.id;
    const { name, description, db_url } = request.body || {};
    const projectsCollection = await getCollection('projects');
    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const updates = {};
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (db_url !== undefined) {
      updates.db_url = db_url ? db_url.trim() : null;
      updates.db_type = detectDbType(updates.db_url);
      evictProjectDb(projectId); // force reconnect on next use
    }
    await projectsCollection.updateOne({ id: projectId }, { $set: updates });
    return reply.send({ project: { ...project, ...updates } });
  });

  // Delete Project
  fastify.delete('/projects/:projectId', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.user.id;
    const projectsCollection = await getCollection('projects');
    const apiKeysCollection = await getCollection('api_keys');

    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    await apiKeysCollection.updateMany({ project_id: projectId }, { $set: { revoked: true } });
    await projectsCollection.deleteOne({ id: projectId });
    evictProjectDb(projectId);
    return reply.send({ message: 'Project deleted' });
  });

  // Create API Key for Project
  fastify.post('/projects/:projectId/keys', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.params;
    const { name, type = 'secret' } = request.body || {};
    const userId = request.user.id;
    const projectsCollection = await getCollection('projects');
    const apiKeysCollection = await getCollection('api_keys');

    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const prefix = type === 'publishable' ? 'pk' : 'sk';
    const rawKey = generateApiKey(prefix);
    const keyHash = hashApiKey(rawKey);
    const keyRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: projectId,
      name: name ? name.trim() : (type === 'publishable' ? 'Publishable Key' : 'Secret Key'),
      type,
      prefix: rawKey.slice(0, 14) + '...',
      key_hash: keyHash,
      revoked: false,
      created_at: new Date().toISOString(),
      last_used_at: null,
    };
    await apiKeysCollection.insertOne(keyRecord);
    return reply.status(201).send({
      message: 'API key created. Store it securely — it will not be shown again.',
      api_key: rawKey,
      id: keyRecord.id,
      name: keyRecord.name,
      type: keyRecord.type,
      prefix: keyRecord.prefix,
    });
  });

  // Revoke API Key
  fastify.delete('/projects/:projectId/keys/:keyId', { preHandler: authenticate }, async (request, reply) => {
    const { projectId, keyId } = request.params;
    const userId = request.user.id;
    const projectsCollection = await getCollection('projects');
    const apiKeysCollection = await getCollection('api_keys');

    const project = await projectsCollection.findOne({ id: projectId, user_id: userId });
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const key = await apiKeysCollection.findOne({ id: keyId, project_id: projectId });
    if (!key) return reply.status(404).send({ error: 'API key not found' });
    await apiKeysCollection.updateOne({ id: keyId }, { $set: { revoked: true } });
    return reply.send({ message: 'API key revoked' });
  });
}

module.exports = projectRoutes;
