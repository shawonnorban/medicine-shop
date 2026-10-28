-- Fast stock reads: each batch carries its running balance, kept in sync with the ledger by a trigger.
-- The ledger (stock_movements) stays the source of truth; qty_on_hand is a cache that can be rebuilt from it.
ALTER TABLE batches ADD COLUMN qty_on_hand int NOT NULL DEFAULT 0;
UPDATE batches b SET qty_on_hand = COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.batch_id = b.id), 0);
ALTER TABLE batches ADD CONSTRAINT batches_qty_nonneg CHECK (qty_on_hand >= 0);

CREATE FUNCTION apply_stock_movement() RETURNS trigger AS $$
BEGIN
  UPDATE batches SET qty_on_hand = qty_on_hand + NEW.qty WHERE id = NEW.batch_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movements_apply AFTER INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- stock_movements is append-only
CREATE FUNCTION forbid_ledger_edit() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'stock_movements is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION forbid_ledger_edit();

CREATE INDEX batches_sellable_idx ON batches (variant_id, expiry_date) WHERE qty_on_hand > 0;

CREATE OR REPLACE VIEW variant_stock AS
SELECT variant_id, SUM(qty_on_hand)::int AS qty, MIN(expiry_date) FILTER (WHERE qty_on_hand > 0) AS nearest_expiry
FROM batches WHERE expiry_date >= CURRENT_DATE GROUP BY variant_id;

-- Purchase (goods received) records
CREATE TABLE purchases (
  id           bigserial PRIMARY KEY,
  supplier_id  int REFERENCES suppliers(id),
  invoice_no   text,
  note         text,
  total_cost   numeric(12,2) NOT NULL DEFAULT 0,
  created_by   int REFERENCES staff(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE purchase_items (
  id          bigserial PRIMARY KEY,
  purchase_id bigint NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  batch_id    int NOT NULL REFERENCES batches(id),
  qty         int NOT NULL CHECK (qty > 0),
  cost_price  numeric(12,2) NOT NULL CHECK (cost_price >= 0)
);
CREATE INDEX purchase_items_purchase_idx ON purchase_items (purchase_id);

ALTER TABLE suppliers ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE suppliers ADD COLUMN address text;

INSERT INTO settings (key, value) VALUES
  ('hide_out_of_stock', 'true'),
  ('low_stock_at', '10'),
  ('expiry_warn_days', '60')
ON CONFLICT DO NOTHING;
