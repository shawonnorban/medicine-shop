// Generates N extra products (default 5000) to test search and listing speed at catalog scale.
import { sql } from './client.js';

const n = Number(process.argv[2] ?? 5000);
await sql`
  WITH g AS (
    INSERT INTO generics (name)
    SELECT 'Bulkgeneric ' || i FROM generate_series(1, ${n / 5}::int) i
    ON CONFLICT DO NOTHING RETURNING id
  ), c AS (SELECT id FROM categories WHERE slug = 'medicine'), co AS (SELECT id FROM companies LIMIT 1)
  INSERT INTO products (slug, name, generic_id, company_id, category_id, dosage_form, strength, description)
  SELECT 'bulk-' || i, 'Bulkmed ' || i, (SELECT id FROM generics WHERE name = 'Bulkgeneric ' || (1 + i % (${n / 5}::int))),
         (SELECT id FROM co), (SELECT id FROM c), 'Tablet', (100 + i % 900) || ' mg', 'Generated for load testing'
  FROM generate_series(1, ${n}::int) i`;
await sql`
  INSERT INTO product_variants (product_id, label, barcode, mrp, price)
  SELECT id, '১ পাতা (১০ টি)', 'B' || id, 50 + id % 200, 45 + id % 200 FROM products WHERE slug LIKE 'bulk-%'`;
const [sup] = await sql`SELECT id FROM suppliers LIMIT 1`;
await sql`
  INSERT INTO batches (product_id, variant_id, supplier_id, batch_no, expiry_date, cost_price)
  SELECT p.id, v.id, ${sup.id}, 'BULK', CURRENT_DATE + 600, 30 FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug LIKE 'bulk-%'`;
await sql`
  INSERT INTO stock_movements (batch_id, qty, reason, ref_type)
  SELECT b.id, 100, 'purchase', 'seed' FROM batches b WHERE b.batch_no = 'BULK'`;
console.log(`added ${n} bulk products`);
await sql.end();
