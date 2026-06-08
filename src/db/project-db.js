const pool = new Map();

async function getProjectDb(project) {
  const pid = project.id;
  if (pool.has(pid)) return pool.get(pid);

  const dbType = detectDbType(project.db_url);
  if (!dbType) {
    throw new Error('Database is not configured for this project');
  }

  let adapter;

  if (dbType === 'postgres') {
    adapter = await createPostgresAdapter(project.db_url, pid);
  } else if (dbType === 'mysql') {
    adapter = await createMysqlAdapter(project.db_url, pid);
  } else if (dbType === 'mongodb') {
    adapter = await createMongoAdapter(project.db_url, pid);
  } else {
    throw new Error('Unsupported database URL. Use postgres://, mysql://, or mongodb://');
  }

  pool.set(pid, adapter);
  return adapter;
}

function evictProjectDb(projectId) {
  const adapter = pool.get(projectId);
  if (adapter && adapter.close) adapter.close();
  pool.delete(projectId);
}

function detectDbType(url) {
  if (!url) return null;
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres';
  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) return 'mysql';
  if (url.startsWith('mongodb://') || url.startsWith('mongodb+srv://')) return 'mongodb';
  return null;
}

// ─── Postgres adapter ─────────────────────────────────────────────────────────
async function createPostgresAdapter(url, projectId) {
  const { Pool } = require('pg');
  const pg = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 });

  // Test connection
  await pg.query('SELECT 1');

  // Auto-create tables
  await pg.query(`
    CREATE TABLE IF NOT EXISTS authkit_users (
      id UUID PRIMARY KEY,
      project_id TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, email)
    );
    CREATE TABLE IF NOT EXISTS authkit_refresh_tokens (
      token TEXT PRIMARY KEY,
      user_id UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return {
    type: 'postgres',

    async findUser(query) {
      const conditions = [];
      const values = [];
      let i = 1;
      if (query.id) { conditions.push(`id = $${i++}`); values.push(query.id); }
      if (query.email) { conditions.push(`email = $${i++}`); values.push(query.email); }
      conditions.push(`project_id = $${i++}`);
      values.push(projectId);
      const { rows } = await pg.query(
        `SELECT * FROM authkit_users WHERE ${conditions.join(' AND ')} LIMIT 1`,
        values
      );
      return rows[0] || null;
    },
    async createUser(user) {
      await pg.query(
        `INSERT INTO authkit_users (id, project_id, email, password_hash, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [user.id, projectId, user.email, user.password_hash, user.created_at]
      );
      return user;
    },
    async countUsers() {
      const { rows } = await pg.query(
        'SELECT COUNT(*) FROM authkit_users WHERE project_id = $1', [projectId]
      );
      return parseInt(rows[0].count, 10);
    },
    async findRefreshToken(token) {
      const { rows } = await pg.query(
        'SELECT * FROM authkit_refresh_tokens WHERE token = $1 LIMIT 1', [token]
      );
      return rows[0] || null;
    },
    async createRefreshToken(record) {
      await pg.query(
        `INSERT INTO authkit_refresh_tokens (token, user_id, expires_at, created_at)
         VALUES ($1,$2,$3,$4)`,
        [record.token, record.user_id, record.expires_at, record.created_at]
      );
    },
    async deleteRefreshToken(token) {
      await pg.query('DELETE FROM authkit_refresh_tokens WHERE token = $1', [token]);
    },
    async testConnection() {
      await pg.query('SELECT 1');
      return true;
    },
    close() { pg.end().catch(() => { }); },
  };
}

// ─── MySQL adapter ────────────────────────────────────────────────────────────
async function createMysqlAdapter(url, projectId) {
  const mysql = require('mysql2/promise');
  // Parse mysql:// URL for mysql2
  const parsed = new URL(url.replace('mysql2://', 'mysql://'));
  const conn = await mysql.createPool({
    host: parsed.hostname,
    port: parsed.port || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace('/', ''),
    waitForConnections: true,
    connectionLimit: 5,
  });

  await conn.query('SELECT 1');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS authkit_users (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uniq_project_email (project_id, email)
    );
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS authkit_refresh_tokens (
      token VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL
    );
  `);

  return {
    type: 'mysql',

    async findUser(query) {
      const conditions = ['project_id = ?'];
      const values = [projectId];
      if (query.id) { conditions.push('id = ?'); values.push(query.id); }
      if (query.email) { conditions.push('email = ?'); values.push(query.email); }
      const [rows] = await conn.query(
        `SELECT * FROM authkit_users WHERE ${conditions.join(' AND ')} LIMIT 1`,
        values
      );
      return rows[0] || null;
    },
    async createUser(user) {
      await conn.query(
        `INSERT INTO authkit_users (id, project_id, email, password_hash, created_at)
         VALUES (?,?,?,?,?)`,
        [user.id, projectId, user.email, user.password_hash, user.created_at]
      );
      return user;
    },
    async countUsers() {
      const [rows] = await conn.query(
        'SELECT COUNT(*) as cnt FROM authkit_users WHERE project_id = ?', [projectId]
      );
      return rows[0].cnt;
    },
    async findRefreshToken(token) {
      const [rows] = await conn.query(
        'SELECT * FROM authkit_refresh_tokens WHERE token = ? LIMIT 1', [token]
      );
      return rows[0] || null;
    },
    async createRefreshToken(record) {
      await conn.query(
        `INSERT INTO authkit_refresh_tokens (token, user_id, expires_at, created_at)
         VALUES (?,?,?,?)`,
        [record.token, record.user_id, record.expires_at, record.created_at]
      );
    },
    async deleteRefreshToken(token) {
      await conn.query('DELETE FROM authkit_refresh_tokens WHERE token = ?', [token]);
    },
    async testConnection() {
      await conn.query('SELECT 1');
      return true;
    },
    close() { conn.end().catch(() => { }); },
  };
}

// ─── MongoDB adapter ─────────────────────────────────────────────────────────
async function createMongoAdapter(url, projectId) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(url, { maxPoolSize: 5 });

  await client.connect();

  const dbName = resolveMongoDbName(url);
  const mongoDb = client.db(dbName);
  const users = mongoDb.collection('authkit_users');
  const refreshTokens = mongoDb.collection('authkit_refresh_tokens');

  await users.createIndex({ project_id: 1, email: 1 }, { unique: true });
  await refreshTokens.createIndex({ token: 1 }, { unique: true });

  return {
    type: 'mongodb',

    async findUser(query) {
      const conditions = { project_id: projectId };
      if (query.id) conditions.id = query.id;
      if (query.email) conditions.email = query.email;
      return users.findOne(conditions);
    },
    async createUser(user) {
      const payload = { ...user, project_id: projectId };
      await users.insertOne(payload);
      return payload;
    },
    async countUsers() {
      return users.countDocuments({ project_id: projectId });
    },
    async findRefreshToken(token) {
      return refreshTokens.findOne({ token });
    },
    async createRefreshToken(record) {
      await refreshTokens.insertOne(record);
    },
    async deleteRefreshToken(token) {
      await refreshTokens.deleteOne({ token });
    },
    async testConnection() {
      await mongoDb.command({ ping: 1 });
      return true;
    },
    close() { client.close().catch(() => { }); },
  };
}

function resolveMongoDbName(url) {
  try {
    const parsed = new URL(url);
    const dbName = (parsed.pathname || '').replace(/^\//, '').trim();
    return dbName || 'authkit';
  } catch {
    return 'authkit';
  }
}

module.exports = { getProjectDb, evictProjectDb, detectDbType };
