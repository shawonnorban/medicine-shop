import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, requirePerm } from '../../lib/auth.js';
import { OrderError, restoreStock } from '../../lib/orders.js';

const FLOW: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export async function adminOrderRoutes(app: FastifyInstance) {
  const read = { preHandler: requirePerm('orders.read') };
  const write = { preHandler: requirePerm('orders.update') };

  app.get('/orders', read, async (req) => {
    const q = z.object({
      status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
      q: z.string().trim().max(40).optional(),
      page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const rows = await sql`
      SELECT order_no AS "orderNo", customer_name AS name, phone, zone, total, payment_method AS "paymentMethod", payment_status AS "paymentStatus",
             status, created_at AS "createdAt", count(*) OVER()::int AS total_rows
      FROM orders
      WHERE true ${q.status ? sql`AND status = ${q.status}` : sql``} ${like ? sql`AND (order_no ILIKE ${like} OR phone ILIKE ${like} OR customer_name ILIKE ${like})` : sql``}
      ORDER BY id DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    const counts = await sql`SELECT status, count(*)::int AS n FROM orders GROUP BY status`;
    return { items: rows.map(({ total_rows: _t, ...r }) => r), total: rows[0]?.total_rows ?? 0, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  });

  app.get('/orders/:orderNo', read, async (req, reply) => {
    const { orderNo } = z.object({ orderNo: z.string().max(30) }).parse(req.params);
    const [o] = await sql`
      SELECT id, order_no AS "orderNo", customer_name AS name, phone, address, zone, note, subtotal, delivery_fee AS "deliveryFee", total,
             payment_method AS "paymentMethod", payment_status AS "paymentStatus", status, created_at AS "createdAt"
      FROM orders WHERE order_no = ${orderNo}`;
    if (!o) return reply.status(404).send({ error: 'not_found' });
    const items = await sql`SELECT name, label, qty, unit_price AS "unitPrice" FROM order_items WHERE order_id = ${o.id} ORDER BY id`;
    const { id: _id, ...order } = o;
    return { ...order, items, next: FLOW[o.status] };
  });

  app.put('/orders/:orderNo/status', write, async (req, reply) => {
    const { orderNo } = z.object({ orderNo: z.string().max(30) }).parse(req.params);
    const { status, paymentStatus } = z.object({
      status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
      paymentStatus: z.enum(['unpaid', 'paid']).optional(),
    }).parse(req.body);
    try {
      await sql.begin(async (tx) => {
        const [o] = await tx`SELECT id, status FROM orders WHERE order_no = ${orderNo} FOR UPDATE`;
        if (!o) throw new OrderError('not_found', undefined, 404);
        if (status) {
          if (!FLOW[o.status].includes(status)) throw new OrderError('invalid_transition', { from: o.status, to: status }, 409);
          if (status === 'cancelled') await restoreStock(tx, o.id);
          await tx`UPDATE orders SET status = ${status}, updated_at = now() WHERE id = ${o.id}`;
          // Cash on delivery is collected when the parcel is handed over
          if (status === 'delivered') await tx`UPDATE orders SET payment_status = 'paid' WHERE id = ${o.id} AND payment_method = 'cod'`;
        }
        if (paymentStatus) await tx`UPDATE orders SET payment_status = ${paymentStatus}, updated_at = now() WHERE id = ${o.id}`;
      });
    } catch (e) {
      if (e instanceof OrderError) return reply.status(e.statusCode).send({ error: e.code, detail: e.detail });
      throw e;
    }
    await audit(req, 'order.update', 'order', orderNo, { status, paymentStatus });
    return { ok: true };
  });
}
