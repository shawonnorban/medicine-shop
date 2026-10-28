import Fastify from 'fastify';
import cors from '@fastify/cors';
import { sql } from './db/client.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { configRoutes } from './routes/config.js';
import { adminRoutes } from './routes/admin/index.js';
import cookie from '@fastify/cookie';

export function buildServer() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(cors, { origin: true });
  app.register(cookie);

  app.get('/health', async () => {
    await sql`SELECT 1`;
    return { ok: true };
  });
  app.register(catalogRoutes, { prefix: '/v1' });
  app.register(orderRoutes, { prefix: '/v1' });
  app.register(configRoutes, { prefix: '/v1' });
  app.register(adminRoutes, { prefix: '/admin' });

  app.setErrorHandler((err: { statusCode?: number; message: string }, req, reply) => {
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error' });
  });
  return app;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const port = Number(process.env.API_PORT ?? 4000);
  buildServer().listen({ port, host: '0.0.0.0' }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
