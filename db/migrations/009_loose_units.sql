-- Loose-piece selling. Stock is counted in the product's base unit (piece, ml, bottle ...).
-- Each pack a customer can buy (strip, box, single piece) says how many base units it contains.
ALTER TABLE products ADD COLUMN base_unit text NOT NULL DEFAULT 'Piece';
ALTER TABLE product_variants
  ADD COLUMN pieces      int NOT NULL DEFAULT 1 CHECK (pieces > 0),
  ADD COLUMN sell_online boolean NOT NULL DEFAULT true,
  ADD COLUMN sell_pos    boolean NOT NULL DEFAULT true;

-- Batches belong to the product (one shared pool), not to one pack size.
ALTER TABLE batches ADD COLUMN product_id int REFERENCES products(id);
UPDATE batches b SET product_id = v.product_id FROM product_variants v WHERE v.id = b.variant_id;
-- the same batch number received under two packs of one product becomes two batches until merged by hand
UPDATE batches SET batch_no = batch_no || '-v' || variant_id
 WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY product_id, batch_no ORDER BY id) rn FROM batches) t WHERE rn > 1);
ALTER TABLE batches ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE batches ALTER COLUMN variant_id DROP NOT NULL;   -- kept only as "received as"
ALTER TABLE batches DROP CONSTRAINT batches_variant_id_batch_no_key;
ALTER TABLE batches ADD CONSTRAINT batches_product_batch_key UNIQUE (product_id, batch_no);
DROP INDEX IF EXISTS batches_sellable_idx;
DROP INDEX IF EXISTS batches_variant_expiry_idx;
CREATE INDEX batches_product_expiry_idx ON batches (product_id, expiry_date);
CREATE INDEX batches_sellable_idx ON batches (product_id, expiry_date) WHERE qty_on_hand > 0;

ALTER TABLE order_items ADD COLUMN pieces int NOT NULL DEFAULT 1;
ALTER TABLE purchase_items ADD COLUMN variant_id int REFERENCES product_variants(id), ADD COLUMN pack_qty int;

DROP VIEW IF EXISTS variant_stock;
CREATE VIEW product_stock AS
SELECT product_id, SUM(qty_on_hand)::int AS qty, MIN(expiry_date) FILTER (WHERE qty_on_hand > 0) AS nearest_expiry
FROM batches WHERE expiry_date >= CURRENT_DATE GROUP BY product_id;

-- Packs of this size that can be sold right now
CREATE VIEW variant_stock AS
SELECT v.id AS variant_id, (ps.qty / v.pieces)::int AS qty, ps.nearest_expiry
FROM product_variants v JOIN product_stock ps ON ps.product_id = v.product_id;
