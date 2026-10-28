import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, requirePerm } from '../../lib/auth.js';
import { getThresholds } from '../../lib/settings.js';

const idParam = z.object({ id: z.coerce.number().int() });

export async function inventoryRoutes(app: FastifyInstance) {
  const read = { preHandler: requirePerm('stock.read') };
  const write = { preHandler: requirePerm('stock.write') };

  // ---- suppliers
  const supBody = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().max(30).nullable().optional(), address: z.string().trim().max(200).nullable().optional(), isActive: z.boolean().default(true) });
  const supCols = sql`id, name, phone, address, is_active AS "isActive"`;
  app.get('/suppliers', read, async () => sql`SELECT ${supCols} FROM suppliers ORDER BY name`);
  app.post('/suppliers', write, async (req, reply) => {
    const b = supBody.parse(req.body);
    const [s] = await sql`INSERT INTO suppliers (name, phone, address, is_active) VALUES (${b.name}, ${b.phone ?? null}, ${b.address ?? null}, ${b.isActive}) RETURNING id`;
    await audit(req, 'supplier.create', 'supplier', s.id, b);
    return reply.status(201).send(s);
  });
  app.put('/suppliers/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params); const b = supBody.parse(req.body);
    const r = await sql`UPDATE suppliers SET name = ${b.name}, phone = ${b.phone ?? null}, address = ${b.address ?? null}, is_active = ${b.isActive} WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'supplier.update', 'supplier', id, b);
    return { ok: true };
  });
  app.delete('/suppliers/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [{ n }] = await sql`SELECT (SELECT count(*) FROM batches WHERE supplier_id = ${id}) + (SELECT count(*) FROM purchases WHERE supplier_id = ${id}) AS n`;
    if (Number(n) > 0) return reply.status(409).send({ error: 'in_use', count: Number(n) });
    const r = await sql`DELETE FROM suppliers WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'supplier.delete', 'supplier', id);
    return { ok: true };
  });

  // ---- purchases (goods received): creates or tops up batches and writes ledger rows
  const purchaseBody = z.object({
    supplierId: z.number().int().nullable().optional(),
    invoiceNo: z.string().trim().max(40).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    items: z.array(z.object({
      variantId: z.number().int().positive(),
      batchNo: z.string().trim().min(1).max(40),
      expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      qty: z.number().int().min(1).max(1_000_000),
      costPrice: z.number().min(0).max(10_000_000),
    })).min(1).max(100),
  });

  app.post('/purchases', write, async (req, reply) => {
    const b = purchaseBody.parse(req.body);
    const today = new Date().toISOString().slice(0, 10);
    if (b.items.some((i) => i.expiryDate <= today)) return reply.status(422).send({ error: 'already_expired' });
    const id = await sql.begin(async (tx) => {
      const total = b.items.reduce((s, i) => s + i.qty * i.costPrice, 0);
      const [p] = await tx`INSERT INTO purchases (supplier_id, invoice_no, note, total_cost, created_by) VALUES (${b.supplierId ?? null}, ${b.invoiceNo ?? null}, ${b.note ?? null}, ${total}, ${req.staff!.id}) RETURNING id`;
      for (const i of b.items) {
        // same variant + batch number = the same physical batch: top it up (expiry must agree), otherwise open a new one
        const [hit] = await tx`SELECT id, expiry_date::text AS expiry FROM batches WHERE variant_id = ${i.variantId} AND batch_no = ${i.batchNo} FOR UPDATE`;
        let batchId: number;
        if (hit) {
          if (hit.expiry !== i.expiryDate) throw Object.assign(new Error('batch_expiry_mismatch'), { statusCode: 409 });
          batchId = hit.id;
          await tx`UPDATE batches SET cost_price = ${i.costPrice} WHERE id = ${batchId}`;
        } else {
          batchId = (await tx`INSERT INTO batches (variant_id, supplier_id, batch_no, expiry_date, cost_price) VALUES (${i.variantId}, ${b.supplierId ?? null}, ${i.batchNo}, ${i.expiryDate}, ${i.costPrice}) RETURNING id`)[0].id;
        }
        await tx`INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id) VALUES (${batchId}, ${i.qty}, 'purchase', 'purchase', ${p.id})`;
        await tx`INSERT INTO purchase_items (purchase_id, batch_id, qty, cost_price) VALUES (${p.id}, ${batchId}, ${i.qty}, ${i.costPrice})`;
      }
      return p.id as number;
    });
    await audit(req, 'purchase.create', 'purchase', id, { items: b.items.length, invoiceNo: b.invoiceNo });
    return reply.status(201).send({ id });
  });

  app.get('/purchases', read, async (req) => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const rows = await sql`
      SELECT p.id, p.invoice_no AS "invoiceNo", p.total_cost AS "totalCost", p.created_at AS "createdAt", s.name AS supplier, st.name AS "by",
             (SELECT count(*)::int FROM purchase_items i WHERE i.purchase_id = p.id) AS lines,
             (SELECT COALESCE(sum(qty), 0)::int FROM purchase_items i WHERE i.purchase_id = p.id) AS units, count(*) OVER()::int AS total_rows
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN staff st ON st.id = p.created_by
      ORDER BY p.id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`;
    return { items: rows.map(({ total_rows: _t, ...r }) => r), total: rows[0]?.total_rows ?? 0 };
  });

  // ---- stock overview: one row per variant
  app.get('/stock', read, async (req) => {
    const q = z.object({ q: z.string().trim().max(60).optional(), filter: z.enum(['low', 'out', 'expiring']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(req.query);
    const { lowStockAt, expiryWarnDays } = await getThresholds();
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const rows = await sql`
      SELECT *, count(*) OVER()::int AS total_rows FROM (
        SELECT v.id AS "variantId", p.name, p.strength, v.label, v.barcode, v.price, g.name AS generic, co.name AS company,
               COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.expiry_date >= CURRENT_DATE), 0)::int AS stock,
               COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.expiry_date < CURRENT_DATE), 0)::int AS expired,
               count(b.id) FILTER (WHERE b.qty_on_hand > 0)::int AS batches,
               min(b.expiry_date) FILTER (WHERE b.qty_on_hand > 0 AND b.expiry_date >= CURRENT_DATE) AS "nearestExpiry"
        FROM product_variants v JOIN products p ON p.id = v.product_id AND p.is_active
        LEFT JOIN generics g ON g.id = p.generic_id LEFT JOIN companies co ON co.id = p.company_id LEFT JOIN batches b ON b.variant_id = v.id
        WHERE true ${like ? sql`AND (p.name ILIKE ${like} OR g.name ILIKE ${like} OR v.barcode = ${q.q!})` : sql``}
        GROUP BY v.id, p.id, g.id, co.id) t
      WHERE true
        ${q.filter === 'out' ? sql`AND stock = 0` : sql``}
        ${q.filter === 'low' ? sql`AND stock > 0 AND stock <= ${lowStockAt}` : sql``}
        ${q.filter === 'expiring' ? sql`AND "nearestExpiry" <= CURRENT_DATE + ${expiryWarnDays}::int` : sql``}
      ORDER BY name, "variantId" LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    return { items: rows.map(({ total_rows: _t, ...r }) => r), total: rows[0]?.total_rows ?? 0, lowStockAt, expiryWarnDays };
  });

  app.get('/stock/:id/batches', read, async (req) => {
    const { id } = idParam.parse(req.params);
    return sql`
      SELECT b.id, b.batch_no AS "batchNo", b.expiry_date AS expiry, b.cost_price AS "costPrice", b.qty_on_hand AS qty, b.received_at AS "receivedAt", s.name AS supplier,
             (b.expiry_date < CURRENT_DATE) AS expired
      FROM batches b LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.variant_id = ${id} ORDER BY b.expiry_date, b.id`;
  });

  // manual correction: damage, count difference, expired write-off, return to supplier
  app.post('/stock/adjust', write, async (req, reply) => {
    const b = z.object({
      batchId: z.number().int(), qty: z.number().int().refine((n) => n !== 0, 'qty must not be 0'),
      reason: z.enum(['adjustment', 'expired_writeoff', 'return_supplier']), note: z.string().trim().max(200).optional(),
    }).parse(req.body);
    if (b.reason !== 'adjustment' && b.qty > 0) return reply.status(422).send({ error: 'qty_must_be_negative' });
    const res = await sql.begin(async (tx) => {
      const [batch] = await tx`SELECT id, qty_on_hand FROM batches WHERE id = ${b.batchId} FOR UPDATE`;
      if (!batch) return 'not_found' as const;
      if (batch.qty_on_hand + b.qty < 0) return 'insufficient' as const;
      await tx`INSERT INTO stock_movements (batch_id, qty, reason, ref_type) VALUES (${b.batchId}, ${b.qty}, ${b.reason}, 'manual')`;
      return 'ok' as const;
    });
    if (res === 'not_found') return reply.status(404).send({ error: 'not_found' });
    if (res === 'insufficient') return reply.status(409).send({ error: 'insufficient_stock' });
    await audit(req, 'stock.adjust', 'batch', b.batchId, b);
    return { ok: true };
  });
}
