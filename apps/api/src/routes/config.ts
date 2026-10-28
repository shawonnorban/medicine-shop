import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client.js';

/** Everything the storefront needs to render store info, delivery zones and payment options. */
export async function configRoutes(app: FastifyInstance) {
  app.get('/config', async (_req, reply) => {
    const [settings, zones, payments] = await Promise.all([
      sql`SELECT key, value FROM settings WHERE key NOT LIKE 'secret\\_%'`,
      sql`SELECT code, name_bn AS "nameBn", fee, free_over AS "freeOver", eta_text AS eta FROM delivery_zones WHERE is_active ORDER BY sort_order, id`,
      sql`SELECT code, name_bn AS "nameBn", instructions FROM payment_methods WHERE is_enabled ORDER BY sort_order`,
    ]);
    reply.header('cache-control', 'public, max-age=10, s-maxage=30, stale-while-revalidate=120');
    return { store: Object.fromEntries(settings.map((r) => [r.key, r.value])), zones, payments };
  });
}
