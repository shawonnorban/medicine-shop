import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, can, requirePerm } from '../../lib/auth.js';
import { allocateStock, OrderError } from '../../lib/orders.js';

const money = (n: number) => Math.round(n * 100) / 100;
const idParam = z.object({ id: z.coerce.number().int() });
type Tx = Parameters<Parameters<typeof sql.begin>[1]>[0];

class PosError extends Error { constructor(public code: string, public statusCode = 422, public detail?: unknown) { super(code); } }

async function openShift(tx: Tx | typeof sql, staffId: number) {
  const [s] = await tx`SELECT id::int AS id, opened_at AS "openedAt", opening_cash AS "openingCash" FROM pos_shifts WHERE staff_id = ${staffId} AND closed_at IS NULL`;
  return s as { id: number; openedAt: string; openingCash: number } | undefined;
}

async function shiftReport(shiftId: number) {
  const [sales] = await sql`
    SELECT count(*)::int AS count, COALESCE(sum(total), 0) AS total, COALESCE(sum(discount), 0) AS discount
    FROM pos_sales WHERE shift_id = ${shiftId} AND status = 'completed'`;
  const methods = await sql`
    SELECT p.method, COALESCE(sum(p.amount), 0) AS amount FROM pos_payments p JOIN pos_sales s ON s.id = p.sale_id
    WHERE s.shift_id = ${shiftId} AND s.status = 'completed' GROUP BY p.method ORDER BY p.method`;
  const [ret] = await sql`SELECT COALESCE(sum(refund), 0) AS refunds, count(*)::int AS count FROM pos_returns WHERE shift_id = ${shiftId}`;
  const [sh] = await sql`SELECT opening_cash AS "openingCash" FROM pos_shifts WHERE id = ${shiftId}`;
  const cash = Number(methods.find((m) => m.method === 'cash')?.amount ?? 0);
  return {
    sales: sales.count as number, total: Number(sales.total), discount: Number(sales.discount),
    byMethod: Object.fromEntries(methods.map((m) => [m.method, Number(m.amount)])),
    refunds: Number(ret.refunds), returns: ret.count as number, openingCash: Number(sh.openingCash),
    expectedCash: money(Number(sh.openingCash) + cash - Number(ret.refunds)),
  };
}

async function getSale(id: number) {
  const [s] = await sql`
    SELECT s.id::int AS id, s.invoice_no AS "invoiceNo", s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.patient_name AS "patientName", s.doctor_name AS "doctorName",
           s.subtotal, s.discount, s.total, s.paid, s.change_due AS "changeDue", s.status, s.note, s.created_at AS "createdAt", s.shift_id::int AS "shiftId", st.name AS cashier
    FROM pos_sales s JOIN staff st ON st.id = s.staff_id WHERE s.id = ${id}`;
  if (!s) return null;
  const items = await sql`SELECT id::int AS id, name, label, qty, pieces, unit_price AS "unitPrice", mrp, batches, returned_qty AS "returnedQty" FROM pos_sale_items WHERE sale_id = ${id} ORDER BY id`;
  const payments = await sql`SELECT method, amount FROM pos_payments WHERE sale_id = ${id} ORDER BY id`;
  const settings = await sql`SELECT key, value FROM settings WHERE key IN ('store_name', 'address', 'phone', 'drug_license', 'pharmacist_name', 'pharmacist_reg', 'receipt_footer')`;
  return { ...s, items, payments, store: Object.fromEntries(settings.map((r) => [r.key, r.value])) };
}

const saleBody = z.object({
  items: z.array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(100000) })).min(1).max(80),
  discount: z.object({ type: z.enum(['amount', 'percent']), value: z.number().min(0).max(10_000_000) }).optional(),
  payments: z.array(z.object({ method: z.enum(['cash', 'card', 'bkash', 'nagad']), amount: z.number().positive().max(10_000_000) })).min(1).max(4),
  customerName: z.string().trim().max(80).nullable().optional(),
  customerPhone: z.string().trim().max(20).nullable().optional(),
  patientName: z.string().trim().max(80).nullable().optional(),
  doctorName: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  heldId: z.number().int().optional(),
});

export async function posRoutes(app: FastifyInstance) {
  const sell = { preHandler: requirePerm('pos.sell') };
  const voidPerm = { preHandler: requirePerm('pos.void') };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof PosError) return reply.status(err.statusCode).send({ error: err.code, detail: err.detail });
    if (err instanceof OrderError) return reply.status(err.statusCode).send({ error: err.code, detail: err.detail });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_request', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error' });
  });

  // ---- shifts
  app.get('/pos/shift', sell, async (req) => {
    const s = await openShift(sql, req.staff!.id);
    return s ? { shift: s, report: await shiftReport(s.id) } : { shift: null };
  });
  app.post('/pos/shift/open', sell, async (req, reply) => {
    const { openingCash } = z.object({ openingCash: z.number().min(0).max(10_000_000) }).parse(req.body);
    try {
      const [s] = await sql`INSERT INTO pos_shifts (staff_id, opening_cash) VALUES (${req.staff!.id}, ${openingCash}) RETURNING id`;
      await audit(req, 'pos.shift.open', 'shift', s.id, { openingCash });
      return reply.status(201).send({ id: s.id });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.status(409).send({ error: 'shift_already_open' });
      throw e;
    }
  });
  app.post('/pos/shift/close', sell, async (req, reply) => {
    const { countedCash, note } = z.object({ countedCash: z.number().min(0).max(10_000_000), note: z.string().trim().max(200).optional() }).parse(req.body);
    const s = await openShift(sql, req.staff!.id);
    if (!s) return reply.status(409).send({ error: 'no_open_shift' });
    const rep = await shiftReport(s.id);
    await sql`UPDATE pos_shifts SET closed_at = now(), counted_cash = ${countedCash}, expected_cash = ${rep.expectedCash}, note = ${note ?? null} WHERE id = ${s.id}`;
    await audit(req, 'pos.shift.close', 'shift', s.id, { counted: countedCash, expected: rep.expectedCash });
    return { report: rep, countedCash, difference: money(countedCash - rep.expectedCash) };
  });

  // ---- search (barcode scan or text). Returns medicines with their counter packs.
  type Row = Record<string, any>;
  const group = (rows: Row[]) => {
    const byProduct = new Map<number, any>();
    for (const r of rows) {
      let p = byProduct.get(r.productId);
      if (!p) { p = { productId: r.productId, name: r.name, strength: r.strength, dosageForm: r.dosageForm, baseUnit: r.baseUnit, rx: r.rx, generic: r.generic, company: r.company, units: r.units, nearestExpiry: r.nearestExpiry, matchedVariantId: null, sameStrength: r.sameStrength ?? null, packs: [] }; byProduct.set(r.productId, p); }
      if (r.isBarcode) p.matchedVariantId = r.variantId;
      p.packs.push({ variantId: r.variantId, label: r.label, unit: r.unit, pieces: r.pieces, price: Number(r.price), mrp: Number(r.mrp), barcode: r.barcode, available: Math.floor(r.units / r.pieces) });
    }
    return [...byProduct.values()];
  };

  app.get('/pos/search', sell, async (req) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(60) }).parse(req.query);
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const rows = await sql`
      SELECT p.id AS "productId", p.name, p.strength, p.dosage_form AS "dosageForm", p.base_unit AS "baseUnit", p.rx, g.name AS generic, co.name AS company,
             v.id AS "variantId", v.label, v.unit, v.pieces, v.price, v.mrp, v.barcode, (v.barcode = ${q}) AS "isBarcode",
             COALESCE(ps.qty, 0) AS units, ps.nearest_expiry::text AS "nearestExpiry"
      FROM products p JOIN product_variants v ON v.product_id = p.id AND v.sell_pos
      LEFT JOIN generics g ON g.id = p.generic_id LEFT JOIN companies co ON co.id = p.company_id LEFT JOIN product_stock ps ON ps.product_id = p.id
      WHERE p.is_active AND (p.id IN (SELECT product_id FROM product_variants WHERE barcode = ${q}) OR p.name ILIKE ${like} OR g.name ILIKE ${like})
      ORDER BY (v.barcode = ${q}) DESC NULLS LAST, (COALESCE(ps.qty, 0) > 0) DESC, p.name, v.sort_order LIMIT 120`;
    return group(rows).slice(0, 15);
  });

  // Other brands of the same generic that are in stock. Same strength first, then cheaper per piece; other strengths follow.
  app.get('/pos/alternatives/:id', sell, async (req) => {
    const { id } = idParam.parse(req.params);
    const rows = await sql`
      SELECT p2.id AS "productId", p2.name, p2.strength, p2.dosage_form AS "dosageForm", p2.base_unit AS "baseUnit", p2.rx, g.name AS generic, co.name AS company,
             v.id AS "variantId", v.label, v.unit, v.pieces, v.price, v.mrp, v.barcode, false AS "isBarcode", ps.qty AS units, ps.nearest_expiry::text AS "nearestExpiry",
             (p2.strength IS NOT DISTINCT FROM p.strength) AS "sameStrength", (v.price / v.pieces) AS per_unit, v.sort_order
      FROM products p
      JOIN products p2 ON p2.generic_id = p.generic_id AND p2.id <> p.id AND p2.is_active
      JOIN product_variants v ON v.product_id = p2.id AND v.sell_pos
      JOIN product_stock ps ON ps.product_id = p2.id AND ps.qty > 0
      JOIN generics g ON g.id = p2.generic_id LEFT JOIN companies co ON co.id = p2.company_id
      WHERE p.id = ${id} AND p.generic_id IS NOT NULL
      ORDER BY (p2.strength IS NOT DISTINCT FROM p.strength) DESC, (SELECT min(x.price / x.pieces) FROM product_variants x WHERE x.product_id = p2.id AND x.sell_pos), p2.id, v.sort_order LIMIT 80`;
    return group(rows).slice(0, 12);
  });

  // ---- sale
  app.post('/pos/sales', sell, async (req, reply) => {
    const b = saleBody.parse(req.body);
    const staff = req.staff!;
    const saleId = await sql.begin(async (tx) => {
      const shift = await openShift(tx, staff.id);
      if (!shift) throw new PosError('no_open_shift', 409);

      const want = new Map<number, number>();
      for (const i of b.items) want.set(i.variantId, (want.get(i.variantId) ?? 0) + i.qty);
      const ids = [...want.keys()];
      const vs = await tx`
        SELECT v.id, v.label, v.price, v.mrp, v.pieces, v.sell_pos, v.product_id, p.name, p.strength, p.rx, p.is_active
        FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id IN ${tx(ids)}`;
      const byId = new Map(vs.map((v) => [v.id as number, v]));
      let needsRx = false;
      for (const id of ids) {
        const v = byId.get(id);
        if (!v || !v.is_active || !v.sell_pos) throw new PosError('product_unavailable', 422, { variantId: id });
        if (v.rx === 'controlled' && !can(staff.role, 'pos.void')) throw new PosError('controlled_pharmacist_only', 403, { name: v.name });
        if (v.rx !== 'otc') needsRx = true;
      }
      if (needsRx && (!b.patientName?.trim() || !b.doctorName?.trim())) throw new PosError('rx_details_required');

      const subtotal = money(ids.reduce((s, id) => s + byId.get(id)!.price * want.get(id)!, 0));
      let discount = 0;
      if (b.discount && b.discount.value > 0) discount = b.discount.type === 'percent' ? money((subtotal * Math.min(b.discount.value, 100)) / 100) : money(b.discount.value);
      if (discount > subtotal) throw new PosError('discount_exceeds_total');
      if (discount > 0 && !can(staff.role, 'pos.void')) {
        const [cap] = await tx`SELECT value FROM settings WHERE key = 'pos_cashier_max_discount_pct'`;
        const maxPct = Number(cap?.value ?? 10);
        if ((discount / subtotal) * 100 > maxPct + 1e-9) throw new PosError('discount_too_high', 403, { maxPct });
      }
      const total = money(subtotal - discount);

      // payments: cash may be tendered over the bill (change is given back); other methods must not exceed what is left
      const given = money(b.payments.reduce((s, p) => s + p.amount, 0));
      if (given < total) throw new PosError('underpaid', 422, { total, given });
      const nonCash = money(b.payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + p.amount, 0));
      const cashGiven = money(given - nonCash);
      const change = money(given - total);
      if (nonCash > total || change > cashGiven) throw new PosError('overpaid_non_cash');
      let cashKept = money(cashGiven - change);
      const net = b.payments.map((p) => ({ ...p }));
      for (const p of net) if (p.method === 'cash') { const keep = Math.min(p.amount, cashKept); cashKept = money(cashKept - keep); p.amount = keep; }

      const [sale] = await tx`
        INSERT INTO pos_sales (shift_id, staff_id, customer_name, customer_phone, patient_name, doctor_name, subtotal, discount, total, paid, change_due, note)
        VALUES (${shift.id}, ${staff.id}, ${b.customerName || null}, ${b.customerPhone || null}, ${b.patientName?.trim() || null}, ${b.doctorName?.trim() || null},
                ${subtotal}, ${discount}, ${total}, ${given}, ${change}, ${b.note || null}) RETURNING id`;

      // consistent lock order: by product, then pack
      const ordered = [...ids].sort((a, c) => byId.get(a)!.product_id - byId.get(c)!.product_id || a - c);
      for (const id of ordered) {
        const v = byId.get(id)!, qty = want.get(id)!;
        const taken = await allocateStock(tx, v.product_id, qty * v.pieces, sale.id, 'sale_pos', 'pos_sale');
        await tx`
          INSERT INTO pos_sale_items (sale_id, variant_id, name, label, qty, pieces, unit_price, mrp, batches)
          VALUES (${sale.id}, ${id}, ${[v.name, v.strength].filter(Boolean).join(' ')}, ${v.label}, ${qty}, ${v.pieces}, ${v.price}, ${v.mrp},
                  ${tx.json(taken.map((t) => ({ batchNo: t.batchNo, expiry: t.expiry, units: t.units })))})`;
      }
      for (const p of net) if (p.amount > 0) await tx`INSERT INTO pos_payments (sale_id, method, amount) VALUES (${sale.id}, ${p.method}, ${p.amount})`;
      if (b.heldId) await tx`DELETE FROM pos_held_bills WHERE id = ${b.heldId} AND staff_id = ${staff.id}`;
      return sale.id as number;
    });
    await audit(req, 'pos.sale', 'pos_sale', saleId);
    return reply.status(201).send(await getSale(saleId));
  });

  app.get('/pos/sales', sell, async (req) => {
    const q = z.object({ q: z.string().trim().max(40).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30), mine: z.enum(['1']).optional() }).parse(req.query);
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const rows = await sql`
      SELECT s.id::int AS id, s.invoice_no AS "invoiceNo", s.total, s.status, s.created_at AS "createdAt", st.name AS cashier, s.customer_name AS "customerName", s.customer_phone AS "customerPhone",
             (SELECT COALESCE(sum(qty), 0)::int FROM pos_sale_items i WHERE i.sale_id = s.id) AS items,
             (SELECT string_agg(DISTINCT method, ', ') FROM pos_payments p WHERE p.sale_id = s.id) AS methods, count(*) OVER()::int AS total_rows
      FROM pos_sales s JOIN staff st ON st.id = s.staff_id
      WHERE true ${like ? sql`AND (s.invoice_no ILIKE ${like} OR s.customer_phone ILIKE ${like} OR s.customer_name ILIKE ${like})` : sql``}
        ${q.mine || !can(req.staff!.role, 'pos.void') ? sql`AND s.staff_id = ${req.staff!.id}` : sql``}
      ORDER BY s.id DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    return { items: rows.map(({ total_rows: _t, ...r }) => r), total: rows[0]?.total_rows ?? 0 };
  });

  app.get('/pos/sales/:id', sell, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const sale = await getSale(id);
    if (!sale) return reply.status(404).send({ error: 'not_found' });
    return sale;
  });

  // whole-bill cancel, only while the shift that made the sale is still open (so no cash has to be reconciled afterwards)
  app.post('/pos/sales/:id/void', voidPerm, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body);
    await sql.begin(async (tx) => {
      const [s] = await tx`SELECT s.id, s.status, sh.closed_at FROM pos_sales s JOIN pos_shifts sh ON sh.id = s.shift_id WHERE s.id = ${id} FOR UPDATE OF s`;
      if (!s) throw new PosError('not_found', 404);
      if (s.status === 'voided') throw new PosError('already_voided', 409);
      if (s.closed_at) throw new PosError('shift_closed_use_return', 409);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM pos_sale_items WHERE sale_id = ${id} AND returned_qty > 0`;
      if (n > 0) throw new PosError('has_returns', 409);
      await tx`
        INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id)
        SELECT batch_id, -SUM(qty), 'return_customer', 'pos_void', ${id} FROM stock_movements WHERE ref_type = 'pos_sale' AND ref_id = ${id} GROUP BY batch_id HAVING SUM(qty) <> 0`;
      await tx`UPDATE pos_sales SET status = 'voided', voided_by = ${req.staff!.id}, voided_at = now(), note = COALESCE(note || ' | ', '') || ${'Void: ' + reason} WHERE id = ${id}`;
    });
    await audit(req, 'pos.void', 'pos_sale', id, { reason });
    return { ok: true };
  });

  // partial or full return after the fact: stock goes back to the batches the goods came from, refund paid from the current shift
  app.post('/pos/sales/:id/return', voidPerm, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ items: z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(1) })).min(1), reason: z.string().trim().min(3).max(200) }).parse(req.body);
    const out = await sql.begin(async (tx) => {
      const shift = await openShift(tx, req.staff!.id);
      if (!shift) throw new PosError('no_open_shift', 409);
      const [s] = await tx`SELECT id, status, subtotal, total FROM pos_sales WHERE id = ${id} FOR UPDATE`;
      if (!s) throw new PosError('not_found', 404);
      if (s.status !== 'completed') throw new PosError('sale_not_completed', 409);
      const ratio = Number(s.subtotal) > 0 ? Number(s.total) / Number(s.subtotal) : 1;   // keep any bill discount proportional
      let refund = 0;
      for (const r of b.items) {
        const [it] = await tx`SELECT i.id, i.qty, i.returned_qty, i.pieces, i.unit_price, v.product_id FROM pos_sale_items i JOIN product_variants v ON v.id = i.variant_id WHERE i.id = ${r.itemId} AND i.sale_id = ${id} FOR UPDATE OF i`;
        if (!it) throw new PosError('item_not_found', 404);
        if (it.returned_qty + r.qty > it.qty) throw new PosError('return_exceeds_sold', 422);
        let units = r.qty * it.pieces;
        // give units back to the batches this sale took them from, most recently allocated first, never more than was taken
        const room = await tx`
          SELECT m.batch_id, COALESCE(-SUM(m.qty) FILTER (WHERE m.reason = 'sale_pos'), 0) - COALESCE(SUM(m.qty) FILTER (WHERE m.reason = 'return_customer'), 0) AS room
          FROM stock_movements m JOIN batches b ON b.id = m.batch_id
          WHERE m.ref_type IN ('pos_sale', 'pos_return') AND m.ref_id = ${id} AND b.product_id = ${it.product_id} GROUP BY m.batch_id ORDER BY m.batch_id DESC`;
        for (const r2 of room) {
          if (units <= 0) break;
          const put = Math.min(units, Number(r2.room));
          if (put <= 0) continue;
          await tx`INSERT INTO stock_movements (batch_id, qty, reason, ref_type, ref_id) VALUES (${r2.batch_id}, ${put}, 'return_customer', 'pos_return', ${id})`;
          units -= put;
        }
        if (units > 0) throw new PosError('return_exceeds_sold', 422);
        await tx`UPDATE pos_sale_items SET returned_qty = returned_qty + ${r.qty} WHERE id = ${it.id}`;
        refund += r.qty * Number(it.unit_price) * ratio;
      }
      refund = money(refund);
      await tx`INSERT INTO pos_returns (sale_id, shift_id, staff_id, refund, reason) VALUES (${id}, ${shift.id}, ${req.staff!.id}, ${refund}, ${b.reason})`;
      return refund;
    });
    await audit(req, 'pos.return', 'pos_sale', id, { refund: out, items: b.items });
    return { refund: out };
  });

  // ---- held bills
  app.get('/pos/held', sell, async (req) => sql`SELECT id, label, payload, created_at AS "createdAt" FROM pos_held_bills WHERE staff_id = ${req.staff!.id} ORDER BY id DESC LIMIT 20`);
  app.post('/pos/held', sell, async (req, reply) => {
    const b = z.object({ label: z.string().trim().max(60).nullable().optional(), payload: z.object({}).passthrough() }).parse(req.body);
    const [h] = await sql`INSERT INTO pos_held_bills (staff_id, label, payload) VALUES (${req.staff!.id}, ${b.label ?? null}, ${sql.json(b.payload as never)}) RETURNING id`;
    return reply.status(201).send(h);
  });
  app.delete('/pos/held/:id', sell, async (req) => {
    const { id } = idParam.parse(req.params);
    await sql`DELETE FROM pos_held_bills WHERE id = ${id} AND staff_id = ${req.staff!.id}`;
    return { ok: true };
  });
}
