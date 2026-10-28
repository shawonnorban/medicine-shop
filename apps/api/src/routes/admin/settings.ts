import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, requirePerm } from '../../lib/auth.js';
import { invalidateSettings } from '../../lib/settings.js';

// Only these keys can be written, each with a length cap. Unknown keys are rejected.
const KEYS = ['store_name', 'tagline', 'phone', 'whatsapp', 'email', 'address', 'drug_license', 'pharmacist_name', 'pharmacist_reg', 'hours_text', 'facebook_url', 'announcement'] as const;
const storeSchema = z.object({
  ...Object.fromEntries(KEYS.map((k) => [k, z.string().trim().max(300).optional()])),
  hide_out_of_stock: z.boolean().optional(),
  low_stock_at: z.number().int().min(0).max(100000).optional(),
  expiry_warn_days: z.number().int().min(1).max(730).optional(),
}).strict();

const zoneBody = z.object({
  code: z.string().regex(/^[a-z0-9_-]{2,30}$/, 'code: a-z, 0-9, - _'),
  nameBn: z.string().trim().min(1).max(60),
  fee: z.number().min(0).max(100000),
  freeOver: z.number().positive().max(10_000_000).nullable(),
  eta: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const pgCode = (e: unknown) => (e as { code?: string }).code;

export async function settingsRoutes(app: FastifyInstance) {
  const admin = { preHandler: requirePerm('settings') };

  // ---- store info
  app.get('/settings/store', admin, async () => {
    const rows = await sql`SELECT key, value FROM settings WHERE key NOT LIKE 'secret\\_%'`;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });
  app.put('/settings/store', admin, async (req) => {
    const body = storeSchema.parse(req.body);
    await sql.begin(async (tx) => {
      for (const [k, v] of Object.entries(body)) {
        if (v === undefined) continue;
        await tx`INSERT INTO settings (key, value) VALUES (${k}, ${tx.json(v)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
      }
    });
    invalidateSettings();
    await audit(req, 'settings.store.update', 'settings', undefined, body);
    return { ok: true };
  });

  // ---- delivery zones
  const zoneCols = sql`id, code, name_bn AS "nameBn", fee, free_over AS "freeOver", eta_text AS eta, is_active AS "isActive", sort_order AS "sortOrder"`;
  app.get('/delivery-zones', admin, async () => sql`SELECT ${zoneCols} FROM delivery_zones ORDER BY sort_order, id`);
  app.post('/delivery-zones', admin, async (req, reply) => {
    const b = zoneBody.parse(req.body);
    try {
      const [z] = await sql`
        INSERT INTO delivery_zones (code, name_bn, fee, free_over, eta_text, is_active, sort_order)
        VALUES (${b.code}, ${b.nameBn}, ${b.fee}, ${b.freeOver}, ${b.eta ?? null}, ${b.isActive}, ${b.sortOrder}) RETURNING ${zoneCols}`;
      await audit(req, 'delivery_zone.create', 'delivery_zone', z.id, b);
      return reply.status(201).send(z);
    } catch (e) {
      if (pgCode(e) === '23505') return reply.status(409).send({ error: 'duplicate_code' });
      throw e;
    }
  });
  app.put('/delivery-zones/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const b = zoneBody.omit({ code: true }).parse(req.body); // code is what old orders reference; never changes
    const [z2] = await sql`
      UPDATE delivery_zones SET name_bn = ${b.nameBn}, fee = ${b.fee}, free_over = ${b.freeOver}, eta_text = ${b.eta ?? null},
             is_active = ${b.isActive}, sort_order = ${b.sortOrder} WHERE id = ${id} RETURNING ${zoneCols}`;
    if (!z2) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'delivery_zone.update', 'delivery_zone', id, b);
    return z2;
  });
  app.delete('/delivery-zones/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const [zone] = await sql`SELECT code FROM delivery_zones WHERE id = ${id}`;
    if (!zone) return reply.status(404).send({ error: 'not_found' });
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM orders WHERE zone = ${zone.code}`;
    if (n > 0) return reply.status(409).send({ error: 'in_use', count: n });
    const [{ active }] = await sql`SELECT count(*)::int AS active FROM delivery_zones WHERE is_active AND id <> ${id}`;
    if (active === 0) return reply.status(409).send({ error: 'last_zone' });
    await sql`DELETE FROM delivery_zones WHERE id = ${id}`;
    await audit(req, 'delivery_zone.delete', 'delivery_zone', id, zone);
    return { ok: true };
  });

  // ---- payment methods (fixed set; admin toggles and edits text)
  app.get('/payment-methods', admin, async () =>
    sql`SELECT code, name_bn AS "nameBn", is_enabled AS "isEnabled", instructions, sort_order AS "sortOrder" FROM payment_methods ORDER BY sort_order`);
  app.put('/payment-methods/:code', admin, async (req, reply) => {
    const { code } = z.object({ code: z.enum(['cod', 'bkash', 'nagad']) }).parse(req.params);
    const b = z.object({ nameBn: z.string().trim().min(1).max(60), isEnabled: z.boolean(), instructions: z.string().trim().max(500).nullable() }).parse(req.body);
    // bKash/Nagad payment collection is not built yet; enabling them now would let customers order without paying.
    if (b.isEnabled && code !== 'cod') return reply.status(409).send({ error: 'gateway_not_available' });
    if (!b.isEnabled && code === 'cod') {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM payment_methods WHERE is_enabled AND code <> 'cod'`;
      if (n === 0) return reply.status(409).send({ error: 'last_method' });
    }
    await sql`UPDATE payment_methods SET name_bn = ${b.nameBn}, is_enabled = ${b.isEnabled}, instructions = ${b.instructions} WHERE code = ${code}`;
    await audit(req, 'payment_method.update', 'payment_method', code, b);
    return { ok: true };
  });
}
