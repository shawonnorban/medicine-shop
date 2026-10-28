import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, requirePerm } from '../../lib/auth.js';

const idParam = z.object({ id: z.coerce.number().int() });
const text = (n: number) => z.string().trim().max(n).nullable().optional();
const body = z.object({
  name: z.string().trim().min(2).max(120),
  drugClass: text(120), indications: text(1500), dosage: text(1500), sideEffects: text(1500),
  contraindications: text(1500), interactions: text(1500), pregnancyNote: text(800), storageInfo: text(400),
});
const nn = (s?: string | null) => (s && s.trim() ? s.trim() : null);

/** Generic library: one reference record per active ingredient. */
export async function genericAdminRoutes(app: FastifyInstance) {
  const read = { preHandler: requirePerm('catalog.read') };
  const write = { preHandler: requirePerm('products.write') };

  app.get('/generic-library', read, async (req) => {
    const q = z.object({ q: z.string().trim().max(60).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50), empty: z.enum(['1']).optional() }).parse(req.query);
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const rows = await sql`
      SELECT g.id, g.name, g.slug, g.drug_class AS "drugClass",
             (g.indications IS NOT NULL AND g.dosage_info IS NOT NULL) AS "hasInfo",
             (SELECT count(*)::int FROM products p WHERE p.generic_id = g.id) AS "productCount", count(*) OVER()::int AS total_rows
      FROM generics g
      WHERE true ${like ? sql`AND (g.name ILIKE ${like} OR g.drug_class ILIKE ${like})` : sql``} ${q.empty ? sql`AND (g.indications IS NULL OR g.dosage_info IS NULL)` : sql``}
      ORDER BY g.name LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    return { items: rows.map(({ total_rows: _t, ...r }) => r), total: rows[0]?.total_rows ?? 0 };
  });

  app.get('/generic-library/:id', read, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [g] = await sql`
      SELECT id, name, slug, drug_class AS "drugClass", indications, dosage_info AS dosage, side_effects AS "sideEffects", contraindications, interactions,
             pregnancy_note AS "pregnancyNote", storage_info AS "storageInfo" FROM generics WHERE id = ${id}`;
    if (!g) return reply.status(404).send({ error: 'not_found' });
    const brands = await sql`SELECT p.id, p.name, p.strength, co.name AS company FROM products p LEFT JOIN companies co ON co.id = p.company_id WHERE p.generic_id = ${id} ORDER BY p.name LIMIT 50`;
    return { ...g, brands };
  });

  app.post('/generic-library', write, async (req, reply) => {
    const b = body.parse(req.body);
    const [dup] = await sql`SELECT id FROM generics WHERE lower(name) = lower(${b.name})`;
    if (dup) return reply.status(409).send({ error: 'duplicate_name' });
    const [g] = await sql`
      INSERT INTO generics (name, drug_class, indications, dosage_info, side_effects, contraindications, interactions, pregnancy_note, storage_info)
      VALUES (${b.name}, ${nn(b.drugClass)}, ${nn(b.indications)}, ${nn(b.dosage)}, ${nn(b.sideEffects)}, ${nn(b.contraindications)}, ${nn(b.interactions)}, ${nn(b.pregnancyNote)}, ${nn(b.storageInfo)}) RETURNING id`;
    await audit(req, 'generic.create', 'generic', g.id, { name: b.name });
    return reply.status(201).send(g);
  });

  app.put('/generic-library/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = body.parse(req.body);
    const [dup] = await sql`SELECT id FROM generics WHERE lower(name) = lower(${b.name}) AND id <> ${id}`;
    if (dup) return reply.status(409).send({ error: 'duplicate_name' });
    const r = await sql`
      UPDATE generics SET name = ${b.name}, drug_class = ${nn(b.drugClass)}, indications = ${nn(b.indications)}, dosage_info = ${nn(b.dosage)}, side_effects = ${nn(b.sideEffects)},
             contraindications = ${nn(b.contraindications)}, interactions = ${nn(b.interactions)}, pregnancy_note = ${nn(b.pregnancyNote)}, storage_info = ${nn(b.storageInfo)}, updated_at = now()
      WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'generic.update', 'generic', id, { name: b.name });
    return { ok: true };
  });

  app.delete('/generic-library/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM products WHERE generic_id = ${id}`;
    if (n > 0) return reply.status(409).send({ error: 'in_use', count: n });
    const r = await sql`DELETE FROM generics WHERE id = ${id} RETURNING name`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'generic.delete', 'generic', id, r[0]);
    return { ok: true };
  });
}
