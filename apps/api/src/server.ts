import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { sql } from './db/client.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { configRoutes } from './routes/config.js';
import { adminRoutes } from './routes/admin/index.js';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { UPLOAD_DIR } from './routes/admin/uploads.js';

export function buildServer() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(cors, { origin: true });
  app.register(cookie);
  app.register(multipart);
  // product images; served with a long cache because file names are random and never reused
  app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/', maxAge: '30d', immutable: true, setHeaders: (res) => { res.setHeader('x-content-type-options', 'nosniff'); } });

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

// Start listening only when this file is the program being run (not when tests import buildServer).
// basename() understands both / and \\ path separators, so this also works on Windows.
const isMain = !!process.argv[1] && basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
if (isMain) {
  const port = Number(process.env.API_PORT ?? 4000);
  buildServer().listen({ port, host: '0.0.0.0' }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
