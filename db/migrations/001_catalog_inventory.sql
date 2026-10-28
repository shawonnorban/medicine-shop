-- Catalog + inventory foundation. Stock is derived from an append-only ledger
-- (stock_movements) so online orders and POS sales can never disagree.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE companies (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE
);

CREATE TABLE categories (
  id          serial PRIMARY KEY,
  parent_id   int REFERENCES categories(id),
  name_bn     text NOT NULL,
  name_en     text NOT NULL,
  slug        text NOT NULL UNIQUE,
  icon        text,
  sort_order  int NOT NULL DEFAULT 0
);

CREATE TABLE generics (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE
);

CREATE TYPE rx_class AS ENUM ('otc', 'prescription', 'controlled');

CREATE TABLE products (
  id           serial PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  generic_id   int REFERENCES generics(id),
  company_id   int REFERENCES companies(id),
  category_id  int REFERENCES categories(id),
  dosage_form  text,                       -- Tablet, Syrup, Capsule ...
  strength     text,                       -- 500 mg
  rx           rx_class NOT NULL DEFAULT 'otc',
  description  text,
  usage_info   text,
  warnings     text,
  image_url    text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id) WHERE is_active;
CREATE INDEX products_generic_idx  ON products (generic_id)  WHERE is_active;
CREATE INDEX products_name_trgm    ON products USING gin (name gin_trgm_ops);
CREATE INDEX generics_name_trgm    ON generics USING gin (name gin_trgm_ops);

-- A sellable unit: pack size / strength of a product, with its own barcode and price.
CREATE TABLE product_variants (
  id           serial PRIMARY KEY,
  product_id   int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label        text NOT NULL,              -- "১ পাতা (১০ টি)"
  unit         text NOT NULL DEFAULT 'Piece',
  barcode      text UNIQUE,
  mrp          numeric(12,2) NOT NULL,     -- printed price
  price        numeric(12,2) NOT NULL,     -- selling price
  sort_order   int NOT NULL DEFAULT 0,
  CHECK (price > 0 AND price <= mrp)
);
CREATE INDEX variants_product_idx ON product_variants (product_id);

CREATE TABLE suppliers (
  id     serial PRIMARY KEY,
  name   text NOT NULL,
  phone  text
);

CREATE TABLE batches (
  id            serial PRIMARY KEY,
  variant_id    int NOT NULL REFERENCES product_variants(id),
  supplier_id   int REFERENCES suppliers(id),
  batch_no      text NOT NULL,
  expiry_date   date NOT NULL,
  cost_price    numeric(12,2) NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, batch_no)
);
CREATE INDEX batches_variant_expiry_idx ON batches (variant_id, expiry_date);

CREATE TYPE stock_reason AS ENUM
  ('purchase', 'sale_online', 'sale_pos', 'return_customer', 'return_supplier', 'adjustment', 'expired_writeoff');

CREATE TABLE stock_movements (
  id          bigserial PRIMARY KEY,
  batch_id    int NOT NULL REFERENCES batches(id),
  qty         int NOT NULL CHECK (qty <> 0),   -- + in, - out
  reason      stock_reason NOT NULL,
  ref_type    text,                            -- 'order', 'pos_invoice', 'purchase'
  ref_id      bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_batch_idx ON stock_movements (batch_id);

-- Sellable stock per variant: remaining qty per batch, expired batches excluded.
CREATE VIEW variant_stock AS
SELECT variant_id,
       SUM(rem)::int AS qty,
       MIN(expiry_date) FILTER (WHERE rem > 0) AS nearest_expiry
FROM (
  SELECT b.variant_id, b.expiry_date, SUM(m.qty) AS rem
  FROM batches b
  JOIN stock_movements m ON m.batch_id = b.id
  WHERE b.expiry_date >= CURRENT_DATE
  GROUP BY b.id
) t
GROUP BY variant_id;
