import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { settingsRoutes } from './settings.js';
import { catalogAdminRoutes } from './catalog.js';
import { staffRoutes } from './staff.js';
import { adminOrderRoutes } from './orders.js';
import { statsRoutes } from './stats.js';
import { ZodError } from 'zod';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onSend', async (_req, reply) => { reply.header('cache-control', 'no-store'); });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: 'invalid_request', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error' });
  });
  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(catalogAdminRoutes);
  await app.register(staffRoutes);
  await app.register(adminOrderRoutes);
  await app.register(statsRoutes);
}
