import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { hideOutOfStock } from '../lib/settings.js';

// Public catalog responses are identical for every visitor, so let the CDN hold them briefly.
const CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

/** True when the product has at least one unexpired batch with units left. Uses the per-batch balance, so it needs no ledger scan. */
const hasStock = (alias: string) => sql`EXISTS (
  SELECT 1 FROM product_variants sv JOIN batches sb ON sb.variant_id = sv.id
  WHERE sv.product_id = ${sql(alias)}.id AND sb.qty_on_hand > 0 AND sb.expiry_date >= CURRENT_DATE)`;
/** The variant shown on cards: the first one that is in stock, otherwise the first one. */
const defaultVariant = (alias: string) => sql`(
  SELECT v.* FROM product_variants v WHERE v.product_id = ${sql(alias)}.id
  ORDER BY EXISTS (SELECT 1 FROM batches b WHERE b.variant_id = v.id AND b.qty_on_hand > 0 AND b.expiry_date >= CURRENT_DATE) DESC, v.sort_order, v.id LIMIT 1)`;

const listQuery = z.object({
  category: z.string().optional(),
  company: z.string().optional(),
  q: z.string().trim().min(1).max(80).optional(),
  rx: z.enum(['otc', 'prescription']).optional(),
  featured: z.enum(['1']).optional(),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'discount']).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/categories', async (_req, reply) => {
    const hide = await hideOutOfStock();
    const rows = await sql`
      SELECT c.id, c.slug, c.name_bn AS "nameBn", c.name_en AS "nameEn", c.icon,
             (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.is_active ${hide ? sql`AND ${hasStock('p')}` : sql``}) AS "productCount"
      FROM categories c ORDER BY c.sort_order`;
    reply.header('cache-control', CACHE);
    return rows;
  });

  app.get('/products', async (req, reply) => {
    const q = listQuery.parse(req.query);
    const offset = (q.page - 1) * q.limit;
    const hide = await hideOutOfStock();
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;

    const order =
      q.sort === 'price_asc' ? sql`dv.price ASC, p.id`
      : q.sort === 'price_desc' ? sql`dv.price DESC, p.id`
      : q.sort === 'discount' ? sql`((dv.mrp - dv.price) / dv.mrp) DESC, p.id`
      : sql`p.name ASC, p.id`;

    // Page first, stock afterwards: stock is summed from the ledger, so only compute it for the rows we return.
    const outerOrder =
      q.sort === 'price_asc' ? sql`page.price ASC, page.slug`
      : q.sort === 'price_desc' ? sql`page.price DESC, page.slug`
      : q.sort === 'discount' ? sql`((page.mrp - page.price) / page.mrp) DESC, page.slug`
      : sql`page.name ASC, page.slug`;

    const rows = await sql`
      WITH page AS (
        SELECT p.slug, p.name, p.dosage_form AS "dosageForm", p.strength, p.rx, p.image_url AS "imageUrl",
               g.name AS generic, co.name AS company, c.slug AS "categorySlug",
               dv.id AS "variantId", dv.label AS "variantLabel", dv.unit, dv.price, dv.mrp,
               count(*) OVER()::int AS total
        FROM products p
        JOIN LATERAL ${defaultVariant('p')} dv ON true
        LEFT JOIN generics g ON g.id = p.generic_id
        LEFT JOIN companies co ON co.id = p.company_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active ${hide ? sql`AND ${hasStock('p')}` : sql``}
          ${q.category ? sql`AND c.slug = ${q.category}` : sql``}
          ${q.company ? sql`AND co.slug = ${q.company}` : sql``}
          ${q.rx ? sql`AND p.rx = ${q.rx}` : sql``}
          ${q.featured ? sql`AND p.is_featured` : sql``}
          ${like ? sql`AND (p.name ILIKE ${like} OR g.name ILIKE ${like})` : sql``}
        ORDER BY ${order}
        LIMIT ${q.limit} OFFSET ${offset}
      )
      SELECT page.*, COALESCE(st.qty, 0) AS stock
      FROM page
      LEFT JOIN LATERAL (
        SELECT SUM(b.qty_on_hand)::int AS qty FROM batches b WHERE b.variant_id = page."variantId" AND b.expiry_date >= CURRENT_DATE
      ) st ON true
      ORDER BY ${outerOrder}`;

    reply.header('cache-control', CACHE);
    return { items: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0, page: q.page, limit: q.limit };
  });

  app.get('/products/:slug', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(req.params);
    const hide = await hideOutOfStock();
    const [p] = await sql`
      SELECT p.id, p.category_id AS "categoryId", p.slug, p.name, p.dosage_form AS "dosageForm", p.strength, p.rx, p.image_url AS "imageUrl",
             p.description, p.usage_info AS usage, p.warnings,
             g.id AS "genericId", g.name AS generic, co.name AS company, co.slug AS "companySlug",
             c.slug AS "categorySlug", c.name_bn AS "categoryNameBn"
      FROM products p
      LEFT JOIN generics g ON g.id = p.generic_id
      LEFT JOIN companies co ON co.id = p.company_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ${slug} AND p.is_active`;
    if (!p) return reply.status(404).send({ error: 'not_found' });

    const [variants, alternatives, related] = await Promise.all([
      sql`
        SELECT v.id, v.label, v.unit, v.price, v.mrp,
               COALESCE(vs.qty, 0) AS stock, to_char(vs.nearest_expiry, 'MM/YYYY') AS "nearestExpiry"
        FROM product_variants v LEFT JOIN variant_stock vs ON vs.variant_id = v.id
        WHERE v.product_id = ${p.id} ORDER BY v.sort_order, v.id`,
      // same generic + same strength, other brands, cheapest first
      p.genericId
        ? sql`
          SELECT p2.slug, p2.name, p2.strength, co.name AS company, dv.price, dv.mrp, dv.label AS "variantLabel"
          FROM products p2
          JOIN LATERAL ${defaultVariant('p2')} dv ON true
          LEFT JOIN companies co ON co.id = p2.company_id
          WHERE ${hide ? sql`${hasStock('p2')} AND` : sql``} p2.generic_id = ${p.genericId} AND p2.id <> ${p.id} AND p2.is_active
            AND p2.strength IS NOT DISTINCT FROM ${p.strength}
          ORDER BY dv.price LIMIT 8`
        : Promise.resolve([]),
      // sidebar: other products from the same category
      sql`
        SELECT p2.slug, p2.name, p2.strength, p2.image_url AS "imageUrl", co.name AS company, dv.price, dv.mrp
        FROM products p2
        JOIN LATERAL ${defaultVariant('p2')} dv ON true
        LEFT JOIN companies co ON co.id = p2.company_id
        WHERE ${hide ? sql`${hasStock('p2')} AND` : sql``} p2.category_id = ${p.categoryId} AND p2.id <> ${p.id} AND p2.is_active
        ORDER BY p2.is_featured DESC, p2.id LIMIT 10`,
    ]);

    const { id: _id, genericId: _g, categoryId: _c, ...product } = p;
    reply.header('cache-control', CACHE);
    return { ...product, variants, alternatives, related };
  });

  // Typeahead: prefix matches first, then fuzzy (typo tolerant) via pg_trgm.
  app.get('/search/suggest', async (req, reply) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(60) }).parse(req.query);
    const hide = await hideOutOfStock();
    const prefix = `${q.replace(/[%_\\]/g, '\\$&')}%`;
    const rows = await sql`
      SELECT p.slug, p.name, p.strength, p.dosage_form AS "dosageForm", g.name AS generic,
             GREATEST(similarity(p.name, ${q}), similarity(COALESCE(g.name, ''), ${q})) AS score
      FROM products p LEFT JOIN generics g ON g.id = p.generic_id
      WHERE p.is_active ${hide ? sql`AND ${hasStock('p')}` : sql``} AND (p.name ILIKE ${prefix} OR g.name ILIKE ${prefix} OR p.name % ${q} OR g.name % ${q})
      ORDER BY (p.name ILIKE ${prefix}) DESC, score DESC, p.name
      LIMIT 8`;
    reply.header('cache-control', 'public, max-age=30');
    return rows.map(({ score: _s, ...r }) => r);
  });
}
