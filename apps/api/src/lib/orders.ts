import { sql } from '../db/client.js';

export type OrderInput = {
  name: string; phone: string; address: string; zone: string; note?: string;
  items: { variantId: number; qty: number }[];
};

export class OrderError extends Error {
  constructor(public code: string, public detail?: unknown, public statusCode = 422) { super(code); }
}

type Tx = Parameters<Parameters<typeof sql.begin>[1]>[0];

/**
 * Take `units` base units (pieces) of a product from its batches, earliest expiry first (FEFO), by appending
 * negative ledger rows. Batches are locked so two concurrent sales cannot take the same units.
 */
export async function allocateStock(tx: Tx, productId: number, units: number, refId: number, reason: 'sale_online' | 'sale_pos' = 'sale_online', refType = 'order') {
  const batches = await tx`
    SELECT b.id, b.batch_no, b.expiry_date::text AS expiry, b.qty_on_hand AS rem
    FROM batches b
    WHERE b.product_id = ${productId} AND b.expiry_date >= CURRENT_DATE AND b.qty_on_hand > 0
    ORDER BY b.expiry_date, b.id
    FOR UPDATE OF b`;
  let need = units;
  const taken: { batchId: number; batchNo: string; expiry: string; units: number }[] = [];
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(need, b.rem);
    if (take <= 0) continue;
    await tx`INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id) VALUES (${b.id}, ${-take}, ${reason}, ${refType}, ${refId})`;
    need -= take;
    taken.push({ batchId: b.id, batchNo: b.batch_no, expiry: b.expiry, units: take });
  }
  if (need > 0) throw new OrderError('insufficient_stock', { productId, availableUnits: units - need });
  return taken;
}

export async function createOrder(input: OrderInput) {
  // merge duplicate variants so the stock check sees the real total
  const want = new Map<number, number>();
  for (const i of input.items) want.set(i.variantId, (want.get(i.variantId) ?? 0) + i.qty);

  return sql.begin(async (tx) => {
    const ids = [...want.keys()];
    const variants = await tx`
      SELECT v.id, v.label, v.price, v.mrp, v.pieces, v.sell_online, v.product_id, p.name, p.strength, p.rx, p.is_active
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN ${tx(ids)}`;
    const byId = new Map(variants.map((v) => [v.id as number, v]));

    for (const id of ids) {
      const v = byId.get(id);
      if (!v || !v.is_active || !v.sell_online) throw new OrderError('product_unavailable', { variantId: id });
      if (v.rx !== 'otc') throw new OrderError('prescription_required', { variantId: id, name: v.name }); // phase 4 adds the Rx flow
    }

    const subtotal = ids.reduce((s, id) => s + byId.get(id)!.price * want.get(id)!, 0);
    const [zone] = await tx`SELECT fee, free_over FROM delivery_zones WHERE code = ${input.zone} AND is_active`;
    if (!zone) throw new OrderError('invalid_zone');
    const fee = zone.free_over != null && subtotal >= zone.free_over ? 0 : zone.fee;
    const total = subtotal + fee;

    const [order] = await tx`
      INSERT INTO orders (customer_name, phone, address, zone, note, subtotal, delivery_fee, total)
      VALUES (${input.name}, ${input.phone}, ${input.address}, ${input.zone}, ${input.note ?? null}, ${subtotal}, ${fee}, ${total})
      RETURNING id, order_no AS "orderNo"`;

    // lock stock per product in a fixed order (avoids deadlocks); packs of one product share a single pool
    const perProduct = new Map<number, number>();
    for (const id of ids) { const v = byId.get(id)!; perProduct.set(v.product_id, (perProduct.get(v.product_id) ?? 0) + want.get(id)! * v.pieces); }
    for (const pid of [...perProduct.keys()].sort((a, b) => a - b)) await allocateStock(tx, pid, perProduct.get(pid)!, order.id);
    for (const id of ids.sort((a, b) => a - b)) {
      const v = byId.get(id)!;
      await tx`
        INSERT INTO order_items (order_id, variant_id, name, label, qty, unit_price, mrp, pieces)
        VALUES (${order.id}, ${id}, ${[v.name, v.strength].filter(Boolean).join(' ')}, ${v.label}, ${want.get(id)!}, ${v.price}, ${v.mrp}, ${v.pieces})`;
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

/** Put every unit of an order back into stock with reversing ledger rows (idempotent per order). */
export async function restoreStock(tx: Tx, orderId: number) {
  await tx`
    INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id)
    SELECT batch_id, -SUM(qty), 'return_customer', 'order', ${orderId}
    FROM stock_movements WHERE ref_type = 'order' AND ref_id = ${orderId} AND reason IN ('sale_online', 'return_customer')
    GROUP BY batch_id HAVING SUM(qty) <> 0`;
}

/** Customers can cancel only while the order is still pending. */
export async function cancelOrder(orderNo: string, phone: string) {
  return sql.begin(async (tx) => {
    const [o] = await tx`SELECT id, status FROM orders WHERE order_no = ${orderNo} AND phone = ${phone} FOR UPDATE`;
    if (!o) throw new OrderError('not_found', undefined, 404);
    if (o.status === 'cancelled') return { status: 'cancelled' as const };
    if (o.status !== 'pending') throw new OrderError('cannot_cancel', { status: o.status }, 409);
    await restoreStock(tx, o.id);
    await tx`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${o.id}`;
    return { status: 'cancelled' as const };
  });
}
