import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, requirePerm } from '../../lib/auth.js';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pgCode = (e: unknown) => (e as { code?: string }).code;

const variantBody = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(20).default('Piece'),
  barcode: z.string().trim().max(40).nullable().optional(),
  mrp: z.number().positive().max(10_000_000),
  price: z.number().positive().max(10_000_000),
  pieces: z.number().int().min(1).max(100000).default(1),     // base units (pieces) in this pack
  sellOnline: z.boolean().default(true),
  sellPos: z.boolean().default(true),
}).refine((v) => v.price <= v.mrp, { message: 'price must not exceed MRP', path: ['price'] });

const productBody = z.object({
  name: z.string().trim().min(1).max(120),
  generic: z.string().trim().max(120).nullable().optional(),
  companyId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  dosageForm: z.string().trim().max(40).nullable().optional(),
  baseUnit: z.string().trim().min(1).max(20).default('Piece'),
  strength: z.string().trim().max(40).nullable().optional(),
  rx: z.enum(['otc', 'prescription', 'controlled']).default('otc'),
  description: z.string().trim().max(2000).nullable().optional(),
  usage: z.string().trim().max(2000).nullable().optional(),
  warnings: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  variants: z.array(variantBody).min(1).max(12),
});

type Tx = Parameters<Parameters<typeof sql.begin>[1]>[0];
async function uniqueSlug(tx: Tx, base: string, exceptId?: number) {
  let slug = slugify(base) || 'product', n = 1;
  for (;;) {
    const [hit] = await tx`SELECT id FROM products WHERE slug = ${slug} ${exceptId ? tx`AND id <> ${exceptId}` : tx``}`;
    if (!hit) return slug;
    slug = `${slugify(base)}-${++n}`;
  }
}

export async function productAdminRoutes(app: FastifyInstance) {
  const read = { preHandler: requirePerm('catalog.read') };
  const write = { preHandler: requirePerm('products.write') };
  const idParam = z.object({ id: z.coerce.number().int() });

  app.get('/products', read, async (req) => {
    const q = z.object({
      q: z.string().trim().max(60).optional(), category: z.coerce.number().int().optional(), rx: z.enum(['otc', 'prescription', 'controlled']).optional(),
      active: z.enum(['1', '0']).optional(), review: z.enum(['1']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30),
    }).parse(req.query);
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const rows = await sql`
      SELECT p.id, p.name, p.strength, p.dosage_form AS "dosageForm", p.rx, p.is_active AS "isActive", p.is_featured AS "isFeatured", p.needs_review AS "needsReview",
             g.name AS generic, co.name AS company, c.name_en AS category,
             (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variants,
             COALESCE((SELECT SUM(b.qty_on_hand) FROM batches b WHERE b.product_id = p.id AND b.expiry_date >= CURRENT_DATE), 0)::int AS stock, p.base_unit AS "baseUnit",
             (SELECT v.price FROM product_variants v WHERE v.product_id = p.id ORDER BY v.sort_order, v.id LIMIT 1) AS price,
             count(*) OVER()::int AS total_rows
      FROM products p
      LEFT JOIN generics g ON g.id = p.generic_id LEFT JOIN companies co ON co.id = p.company_id LEFT JOIN categories c ON c.id = p.category_id
      WHERE true
        ${like ? sql`AND (p.name ILIKE ${like} OR g.name ILIKE ${like} OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.barcode = ${q.q!}))` : sql``}
        ${q.category ? sql`AND p.category_id = ${q.category}` : sql``} ${q.rx ? sql`AND p.rx = ${q.rx}` : sql``}
        ${q.active ? sql`AND p.is_active = ${q.active === '1'}` : sql``} ${q.review ? sql`AND p.needs_review` : sql``}
      ORDER BY p.name, p.id LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    return { items: rows.map(({ total_rows: _t, ...r }) => r), total: rows[0]?.total_rows ?? 0 };
  });

  app.get('/products/:id', read, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [p] = await sql`
      SELECT p.id, p.name, g.name AS generic, p.company_id AS "companyId", p.category_id AS "categoryId", p.dosage_form AS "dosageForm", p.base_unit AS "baseUnit", p.strength, p.rx,
             p.description, p.usage_info AS usage, p.warnings, p.image_url AS "imageUrl", p.is_active AS "isActive", p.is_featured AS "isFeatured", p.needs_review AS "needsReview", p.slug
      FROM products p LEFT JOIN generics g ON g.id = p.generic_id WHERE p.id = ${id}`;
    if (!p) return reply.status(404).send({ error: 'not_found' });
    const variants = await sql`
      SELECT v.id, v.label, v.unit, v.barcode, v.mrp, v.price, v.pieces, v.sell_online AS "sellOnline", v.sell_pos AS "sellPos",
             (COALESCE((SELECT SUM(b.qty_on_hand) FROM batches b WHERE b.product_id = v.product_id AND b.expiry_date >= CURRENT_DATE), 0) / v.pieces)::int AS stock
      FROM product_variants v WHERE v.product_id = ${id} ORDER BY v.sort_order, v.id`;
    return { ...p, variants };
  });

  app.get('/generics', read, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(60).default('') }).parse(req.query);
    return sql`SELECT id, name FROM generics WHERE name ILIKE ${'%' + q.replace(/[%_\\]/g, '\\$&') + '%'} ORDER BY name LIMIT 20`;
  });

  app.post('/products', write, async (req, reply) => {
    const b = productBody.parse(req.body);
    try {
      const id = await sql.begin(async (tx) => {
        const genericId = b.generic ? (await tx`INSERT INTO generics (name) VALUES (${b.generic}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`)[0].id : null;
        const slug = await uniqueSlug(tx, [b.name, b.strength, b.dosageForm].filter(Boolean).join(' '));
        const [p] = await tx`
          INSERT INTO products (slug, name, generic_id, company_id, category_id, dosage_form, base_unit, strength, rx, description, usage_info, warnings, image_url, is_active, is_featured)
          VALUES (${slug}, ${b.name}, ${genericId}, ${b.companyId ?? null}, ${b.categoryId ?? null}, ${b.dosageForm ?? null}, ${b.baseUnit}, ${b.strength ?? null}, ${b.rx},
                  ${b.description ?? null}, ${b.usage ?? null}, ${b.warnings ?? null}, ${b.imageUrl ?? null}, ${b.isActive}, ${b.isFeatured}) RETURNING id`;
        let order = 0;
        for (const v of b.variants) {
          await tx`INSERT INTO product_variants (product_id, label, unit, barcode, mrp, price, pieces, sell_online, sell_pos, sort_order)
                   VALUES (${p.id}, ${v.label}, ${v.unit}, ${v.barcode || null}, ${v.mrp}, ${v.price}, ${v.pieces}, ${v.sellOnline}, ${v.sellPos}, ${order++})`;
        }
        return p.id as number;
      });
      await audit(req, 'product.create', 'product', id, { name: b.name });
      return reply.status(201).send({ id });
    } catch (e) {
      if (pgCode(e) === '23505') return reply.status(409).send({ error: 'duplicate_barcode' });
      throw e;
    }
  });

  app.put('/products/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = productBody.parse(req.body);
    try {
      const res = await sql.begin(async (tx) => {
        const [cur] = await tx`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
        if (!cur) return 'not_found' as const;
        const genericId = b.generic ? (await tx`INSERT INTO generics (name) VALUES (${b.generic}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`)[0].id : null;
        await tx`
          UPDATE products SET name = ${b.name}, generic_id = ${genericId}, company_id = ${b.companyId ?? null}, category_id = ${b.categoryId ?? null},
                 dosage_form = ${b.dosageForm ?? null}, base_unit = ${b.baseUnit}, strength = ${b.strength ?? null}, rx = ${b.rx}, description = ${b.description ?? null},
                 usage_info = ${b.usage ?? null}, warnings = ${b.warnings ?? null}, image_url = ${b.imageUrl ?? null}, is_active = ${b.isActive}, is_featured = ${b.isFeatured}, needs_review = false   -- a person saved it, so it counts as reviewed
          WHERE id = ${id}`;
        // variants: update the ones with ids, insert new ones, remove the ones dropped (only if never stocked or ordered)
        const keep = b.variants.filter((v) => v.id).map((v) => v.id!);
        const existing = await tx`SELECT id FROM product_variants WHERE product_id = ${id}`;
        for (const row of existing) {
          if (keep.includes(row.id)) continue;
          const [used] = await tx`SELECT (EXISTS (SELECT 1 FROM purchase_items WHERE variant_id = ${row.id}) OR EXISTS (SELECT 1 FROM order_items WHERE variant_id = ${row.id})) AS u`;
          if (used.u) return 'variant_in_use' as const;
          await tx`DELETE FROM product_variants WHERE id = ${row.id}`;
        }
        let order = 0;
        for (const v of b.variants) {
          if (v.id) await tx`UPDATE product_variants SET label = ${v.label}, unit = ${v.unit}, barcode = ${v.barcode || null}, mrp = ${v.mrp}, price = ${v.price}, pieces = ${v.pieces}, sell_online = ${v.sellOnline}, sell_pos = ${v.sellPos}, sort_order = ${order++} WHERE id = ${v.id} AND product_id = ${id}`;
          else await tx`INSERT INTO product_variants (product_id, label, unit, barcode, mrp, price, pieces, sell_online, sell_pos, sort_order) VALUES (${id}, ${v.label}, ${v.unit}, ${v.barcode || null}, ${v.mrp}, ${v.price}, ${v.pieces}, ${v.sellOnline}, ${v.sellPos}, ${order++})`;
        }
        return 'ok' as const;
      });
      if (res === 'not_found') return reply.status(404).send({ error: 'not_found' });
      if (res === 'variant_in_use') return reply.status(409).send({ error: 'variant_in_use' });
      await audit(req, 'product.update', 'product', id, { name: b.name });
      return { ok: true };
    } catch (e) {
      if (pgCode(e) === '23505') return reply.status(409).send({ error: 'duplicate_barcode' });
      throw e;
    }
  });

  app.delete('/products/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [u] = await sql`SELECT (EXISTS (SELECT 1 FROM batches b WHERE b.product_id = ${id}) OR EXISTS (SELECT 1 FROM product_variants v JOIN order_items o ON o.variant_id = v.id WHERE v.product_id = ${id})) AS used`;
    if (u.used) return reply.status(409).send({ error: 'product_in_use' }); // has stock history or orders: deactivate instead
    const r = await sql`DELETE FROM products WHERE id = ${id} RETURNING name`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'product.delete', 'product', id, { name: r[0].name });
    return { ok: true };
  });

  // flat pack search for POS and purchase forms. `for=pos` only returns packs sold at the counter.
  app.get('/variants/search', { preHandler: requirePerm('stock.read') }, async (req) => {
    const { q, for: use } = z.object({ q: z.string().trim().min(1).max(60), for: z.enum(['pos', 'purchase']).default('purchase') }).parse(req.query);
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    return sql`
      SELECT v.id, v.label, v.unit, v.barcode, v.mrp, v.price, v.pieces, p.id AS "productId", p.name, p.strength, p.dosage_form AS "dosageForm", p.base_unit AS "baseUnit", p.rx,
             g.name AS generic, co.name AS company,
             COALESCE((SELECT SUM(b.qty_on_hand) FROM batches b WHERE b.product_id = p.id AND b.expiry_date >= CURRENT_DATE), 0)::int AS units
      FROM product_variants v JOIN products p ON p.id = v.product_id AND p.is_active
      LEFT JOIN generics g ON g.id = p.generic_id LEFT JOIN companies co ON co.id = p.company_id
      WHERE (v.barcode = ${q} OR p.name ILIKE ${like} OR g.name ILIKE ${like}) ${use === 'pos' ? sql`AND v.sell_pos` : sql``}
      ORDER BY (v.barcode = ${q}) DESC NULLS LAST, p.name, v.sort_order LIMIT 30`;
  });
}
