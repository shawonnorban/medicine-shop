-- Counter sales (POS): shifts, sales, split payments, held bills.
CREATE SEQUENCE pos_invoice_seq START 100001;

CREATE TABLE pos_shifts (
  id             bigserial PRIMARY KEY,
  staff_id       int NOT NULL REFERENCES staff(id),
  opened_at      timestamptz NOT NULL DEFAULT now(),
  opening_cash   numeric(12,2) NOT NULL CHECK (opening_cash >= 0),
  closed_at      timestamptz,
  counted_cash   numeric(12,2),
  expected_cash  numeric(12,2),
  note           text
);
-- one open shift per cashier
CREATE UNIQUE INDEX pos_shifts_one_open ON pos_shifts (staff_id) WHERE closed_at IS NULL;

CREATE TYPE pos_sale_status AS ENUM ('completed', 'voided');

CREATE TABLE pos_sales (
  id              bigserial PRIMARY KEY,
  invoice_no      text NOT NULL UNIQUE DEFAULT ('INV-' || nextval('pos_invoice_seq')),
  shift_id        bigint NOT NULL REFERENCES pos_shifts(id),
  staff_id        int NOT NULL REFERENCES staff(id),
  customer_name   text,
  customer_phone  text,
  patient_name    text,           -- required for prescription medicines
  doctor_name     text,
  subtotal        numeric(12,2) NOT NULL,
  discount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total           numeric(12,2) NOT NULL,
  paid            numeric(12,2) NOT NULL,
  change_due      numeric(12,2) NOT NULL DEFAULT 0,
  status          pos_sale_status NOT NULL DEFAULT 'completed',
  note            text,
  voided_by       int REFERENCES staff(id),
  voided_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_sales_created_idx ON pos_sales (created_at DESC);
CREATE INDEX pos_sales_shift_idx ON pos_sales (shift_id);
CREATE INDEX pos_sales_phone_idx ON pos_sales (customer_phone) WHERE customer_phone IS NOT NULL;

CREATE TABLE pos_sale_items (
  id          bigserial PRIMARY KEY,
  sale_id     bigint NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  variant_id  int NOT NULL REFERENCES product_variants(id),
  name        text NOT NULL,
  label       text NOT NULL,
  qty         int NOT NULL CHECK (qty > 0),
  pieces      int NOT NULL,          -- base units per pack at sale time
  unit_price  numeric(12,2) NOT NULL,
  mrp         numeric(12,2) NOT NULL,
  batches     jsonb NOT NULL DEFAULT '[]',     -- [{batchNo, expiry, units}] actually taken (FEFO)
  returned_qty int NOT NULL DEFAULT 0 CHECK (returned_qty >= 0)
);
CREATE INDEX pos_sale_items_sale_idx ON pos_sale_items (sale_id);

CREATE TABLE pos_payments (
  id        bigserial PRIMARY KEY,
  sale_id   bigint NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method    text NOT NULL CHECK (method IN ('cash', 'card', 'bkash', 'nagad')),
  amount    numeric(12,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX pos_payments_sale_idx ON pos_payments (sale_id);

-- Money handed back for returned goods (counts against the shift's cash)
CREATE TABLE pos_returns (
  id          bigserial PRIMARY KEY,
  sale_id     bigint NOT NULL REFERENCES pos_sales(id),
  shift_id    bigint NOT NULL REFERENCES pos_shifts(id),
  staff_id    int NOT NULL REFERENCES staff(id),
  refund      numeric(12,2) NOT NULL CHECK (refund >= 0),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pos_held_bills (
  id         bigserial PRIMARY KEY,
  staff_id   int NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  label      text,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('pos_cashier_max_discount_pct', '10'),
  ('receipt_footer', '"Thank you. Keep medicines away from children. Returns only with this receipt."')
ON CONFLICT DO NOTHING;
