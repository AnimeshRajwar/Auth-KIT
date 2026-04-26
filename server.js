require('dotenv').config();

const path = require('path');
const fastify = require('fastify')({
  logger: {
    level: 'info',
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

// ── Plugins ───────────────────────────────────────────────────────────────────
fastify.register(require('@fastify/cors'), { origin: true });

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_ACCESS_SECRET || 'fallback-change-me',
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// ── Routes ────────────────────────────────────────────────────────────────────
fastify.register(require('./src/routes/auth'));
fastify.register(require('./src/routes/projects'));
fastify.register(require('./src/routes/project-auth'));

// ── Health Check ──────────────────────────────────────────────────────────────
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`UI available at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
