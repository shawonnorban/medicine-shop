import type { FastifyInstance } from 'fastify';
import { sql } from '../../db/client.js';
import { requirePerm } from '../../lib/auth.js';
import { getThresholds } from '../../lib/settings.js';


/** Numbers for the dashboard strip. "Today" uses the Dhaka calendar day. */
export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', { preHandler: requirePerm('orders.read') }, async () => {
    const { lowStockAt, expiryWarnDays } = await getThresholds();
    const [o] = await sql`
      SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka')::int AS "ordersToday",
             COALESCE(sum(total) FILTER (WHERE status <> 'cancelled' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka'), 0) AS "salesToday",
             count(*) FILTER (WHERE status IN ('confirmed', 'processing'))::int AS "toShip"
      FROM orders`;
    const [pos] = await sql`SELECT COALESCE(sum(total), 0) AS total FROM pos_sales WHERE status = 'completed' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka'`;
    const [s] = await sql`
      SELECT count(*)::int AS "lowStock" FROM (
        SELECT p.id FROM products p
        JOIN LATERAL (SELECT pieces FROM product_variants v WHERE v.product_id = p.id ORDER BY v.sort_order, v.id LIMIT 1) pv ON true
        LEFT JOIN batches b ON b.product_id = p.id AND b.expiry_date >= CURRENT_DATE
        WHERE p.is_active GROUP BY p.id, pv.pieces HAVING COALESCE(SUM(b.qty_on_hand), 0) / pv.pieces <= ${lowStockAt}) t`;
    const [e] = await sql`
      SELECT count(*)::int AS expiring FROM batches
      WHERE qty_on_hand > 0 AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ${expiryWarnDays}::int`;
    return { ...o, salesToday: Number(o.salesToday) + Number(pos.total), counterSalesToday: Number(pos.total), lowStock: s.lowStock, expiringBatches: e.expiring, lowStockAt, expiryWarnDays };
  });
}
