import { sql } from '../db/client.js';

export const DELIVERY_FEE = { dhaka: 60, outside: 120 } as const;
export const FREE_DELIVERY_OVER = 1500;

export type OrderInput = {
  name: string; phone: string; address: string; zone: 'dhaka' | 'outside'; note?: string;
  items: { variantId: number; qty: number }[];
};

export class OrderError extends Error {
  constructor(public code: string, public detail?: unknown, public statusCode = 422) { super(code); }
}

type Tx = Parameters<Parameters<typeof sql.begin>[1]>[0];

/**
 * Take `qty` units of a variant from its batches, earliest expiry first (FEFO), by appending negative
 * ledger rows. Batches are locked so two concurrent orders cannot take the same units.
 */
export async function allocateStock(tx: Tx, variantId: number, qty: number, orderId: number) {
  const batches = await tx`
    SELECT b.id, COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.batch_id = b.id), 0)::int AS rem
    FROM batches b
    WHERE b.variant_id = ${variantId} AND b.expiry_date >= CURRENT_DATE
    ORDER BY b.expiry_date, b.id
    FOR UPDATE OF b`;
  let need = qty;
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(need, b.rem);
    if (take <= 0) continue;
    await tx`INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id) VALUES (${b.id}, ${-take}, 'sale_online', 'order', ${orderId})`;
    need -= take;
  }
  if (need > 0) throw new OrderError('insufficient_stock', { variantId, available: qty - need });
}

export async function createOrder(input: OrderInput) {
  // merge duplicate variants so the stock check sees the real total
  const want = new Map<number, number>();
  for (const i of input.items) want.set(i.variantId, (want.get(i.variantId) ?? 0) + i.qty);

  return sql.begin(async (tx) => {
    const ids = [...want.keys()];
    const variants = await tx`
      SELECT v.id, v.label, v.price, v.mrp, p.name, p.strength, p.rx, p.is_active
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN ${tx(ids)}`;
    const byId = new Map(variants.map((v) => [v.id as number, v]));

    for (const id of ids) {
      const v = byId.get(id);
      if (!v || !v.is_active) throw new OrderError('product_unavailable', { variantId: id });
      if (v.rx !== 'otc') throw new OrderError('prescription_required', { variantId: id, name: v.name }); // phase 4 adds the Rx flow
    }

    const subtotal = ids.reduce((s, id) => s + byId.get(id)!.price * want.get(id)!, 0);
    const fee = subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE[input.zone];
    const total = subtotal + fee;

    const [order] = await tx`
      INSERT INTO orders (customer_name, phone, address, zone, note, subtotal, delivery_fee, total)
      VALUES (${input.name}, ${input.phone}, ${input.address}, ${input.zone}, ${input.note ?? null}, ${subtotal}, ${fee}, ${total})
      RETURNING id, order_no AS "orderNo"`;

    for (const id of ids.sort((a, b) => a - b)) { // consistent lock order avoids deadlocks
      const v = byId.get(id)!;
      const qty = want.get(id)!;
      await allocateStock(tx, id, qty, order.id);
      await tx`
        INSERT INTO order_items (order_id, variant_id, name, label, qty, unit_price, mrp)
        VALUES (${order.id}, ${id}, ${[v.name, v.strength].filter(Boolean).join(' ')}, ${v.label}, ${qty}, ${v.price}, ${v.mrp})`;
    }
    return { orderNo: order.orderNo as string, subtotal, deliveryFee: fee, total };
  });
}

export async function getOrder(orderNo: string, phone: string) {
  const [o] = await sql`
    SELECT id, order_no AS "orderNo", customer_name AS name, phone, address, zone, note, subtotal, delivery_fee AS "deliveryFee",
           total, payment_method AS "paymentMethod", payment_status AS "paymentStatus", status, created_at AS "createdAt"
    FROM orders WHERE order_no = ${orderNo} AND phone = ${phone}`;
  if (!o) return null;
  const items = await sql`SELECT name, label, qty, unit_price AS "unitPrice" FROM order_items WHERE order_id = ${o.id} ORDER BY id`;
  const { id: _id, ...order } = o;
  return { ...order, items };
}

/** Customers can cancel only while the order is still pending; stock goes back via reversing ledger rows. */
export async function cancelOrder(orderNo: string, phone: string) {
  return sql.begin(async (tx) => {
    const [o] = await tx`SELECT id, status FROM orders WHERE order_no = ${orderNo} AND phone = ${phone} FOR UPDATE`;
    if (!o) throw new OrderError('not_found', undefined, 404);
    if (o.status === 'cancelled') return { status: 'cancelled' as const };
    if (o.status !== 'pending') throw new OrderError('cannot_cancel', { status: o.status }, 409);
    await tx`
      INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id)
      SELECT batch_id, -SUM(qty), 'return_customer', 'order', ${o.id}
      FROM stock_movements WHERE ref_type = 'order' AND ref_id = ${o.id} AND reason = 'sale_online'
      GROUP BY batch_id HAVING SUM(qty) <> 0`;
    await tx`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${o.id}`;
    return { status: 'cancelled' as const };
  });
}
