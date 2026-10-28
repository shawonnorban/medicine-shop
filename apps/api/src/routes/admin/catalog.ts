import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, requirePerm } from '../../lib/auth.js';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pgCode = (e: unknown) => (e as { code?: string }).code;
const idParam = z.object({ id: z.coerce.number().int() });

export async function catalogAdminRoutes(app: FastifyInstance) {
  const admin = { preHandler: requirePerm('catalog.write') };
  const read = { preHandler: requirePerm('catalog.read') };

  // ---- categories
  const catBody = z.object({
    nameBn: z.string().trim().min(1).max(60), nameEn: z.string().trim().min(1).max(60),
    slug: z.string().regex(/^[a-z0-9-]{2,50}$/).optional(), icon: z.string().max(8).nullable().optional(), sortOrder: z.number().int().default(0),
  });
  const catCols = sql`id, slug, name_bn AS "nameBn", name_en AS "nameEn", icon, sort_order AS "sortOrder", (SELECT count(*)::int FROM products p WHERE p.category_id = categories.id) AS "productCount"`;
  app.get('/categories', read, async () => sql`SELECT ${catCols} FROM categories ORDER BY sort_order, id`);
  app.post('/categories', admin, async (req, reply) => {
    const b = catBody.parse(req.body);
    try {
      const [c] = await sql`INSERT INTO categories (name_bn, name_en, slug, icon, sort_order) VALUES (${b.nameBn}, ${b.nameEn}, ${b.slug ?? (slugify(b.nameEn) || 'cat-' + Date.now())}, ${b.icon ?? null}, ${b.sortOrder}) RETURNING id`;
      await audit(req, 'category.create', 'category', c.id, b);
      return reply.status(201).send(c);
    } catch (e) { if (pgCode(e) === '23505') return reply.status(409).send({ error: 'duplicate_slug' }); throw e; }
  });
  app.put('/categories/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = catBody.omit({ slug: true }).parse(req.body);
    const r = await sql`UPDATE categories SET name_bn = ${b.nameBn}, name_en = ${b.nameEn}, icon = ${b.icon ?? null}, sort_order = ${b.sortOrder} WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'category.update', 'category', id, b);
    return { ok: true };
  });
  app.delete('/categories/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM products WHERE category_id = ${id}`;
    if (n > 0) return reply.status(409).send({ error: 'in_use', message: `${n}টি পণ্য এই ক্যাটাগরিতে আছে। আগে পণ্যগুলো সরান` });
    const r = await sql`DELETE FROM categories WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'category.delete', 'category', id);
    return { ok: true };
  });

  // ---- companies
  const coBody = z.object({ name: z.string().trim().min(1).max(100) });
  const coCols = sql`id, name, slug, (SELECT count(*)::int FROM products p WHERE p.company_id = companies.id) AS "productCount"`;
  app.get('/companies', read, async () => sql`SELECT ${coCols} FROM companies ORDER BY name`);
  app.post('/companies', admin, async (req, reply) => {
    const b = coBody.parse(req.body);
    try {
      const [c] = await sql`INSERT INTO companies (name, slug) VALUES (${b.name}, ${slugify(b.name) || 'co-' + Date.now()}) RETURNING id`;
      await audit(req, 'company.create', 'company', c.id, b);
      return reply.status(201).send(c);
    } catch (e) { if (pgCode(e) === '23505') return reply.status(409).send({ error: 'duplicate_name' }); throw e; }
  });
  app.put('/companies/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = coBody.parse(req.body);
    try {
      const r = await sql`UPDATE companies SET name = ${b.name} WHERE id = ${id} RETURNING id`;
      if (!r.length) return reply.status(404).send({ error: 'not_found' });
    } catch (e) { if (pgCode(e) === '23505') return reply.status(409).send({ error: 'duplicate_name' }); throw e; }
    await audit(req, 'company.update', 'company', id, b);
    return { ok: true };
  });
  app.delete('/companies/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM products WHERE company_id = ${id}`;
    if (n > 0) return reply.status(409).send({ error: 'in_use', message: `${n}টি পণ্য এই কোম্পানির` });
    const r = await sql`DELETE FROM companies WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'company.delete', 'company', id);
    return { ok: true };
  });
}
