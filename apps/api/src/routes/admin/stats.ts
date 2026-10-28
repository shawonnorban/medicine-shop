import type { FastifyInstance } from 'fastify';
import { sql } from '../../db/client.js';
import { requirePerm } from '../../lib/auth.js';

export const LOW_STOCK_AT = 10;
export const EXPIRY_WARN_DAYS = 60;

/** Numbers for the dashboard strip. "Today" uses the Dhaka calendar day. */
export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', { preHandler: requirePerm('orders.read') }, async () => {
    const [o] = await sql`
      SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka')::int AS "ordersToday",
             COALESCE(sum(total) FILTER (WHERE status <> 'cancelled' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka'), 0) AS "salesToday",
             count(*) FILTER (WHERE status IN ('confirmed', 'processing'))::int AS "toShip"
      FROM orders`;
    const [s] = await sql`
      WITH per AS (
        SELECT v.id, COALESCE((SELECT SUM(m.qty) FROM batches b JOIN stock_movements m ON m.batch_id = b.id WHERE b.variant_id = v.id AND b.expiry_date >= CURRENT_DATE), 0) AS qty
        FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.is_active)
      SELECT count(*) FILTER (WHERE qty <= ${LOW_STOCK_AT})::int AS "lowStock" FROM per`;
    const [e] = await sql`
      SELECT count(*)::int AS expiring FROM (
        SELECT b.id FROM batches b JOIN stock_movements m ON m.batch_id = b.id
        WHERE b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ${EXPIRY_WARN_DAYS}::int
        GROUP BY b.id HAVING SUM(m.qty) > 0) t`;
    return { ...o, salesToday: Number(o.salesToday), lowStock: s.lowStock, expiringBatches: e.expiring, lowStockAt: LOW_STOCK_AT, expiryWarnDays: EXPIRY_WARN_DAYS };
  });
}
