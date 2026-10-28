CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cod', 'bkash', 'nagad');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded');

CREATE SEQUENCE order_no_seq START 100001;

CREATE TABLE orders (
  id               bigserial PRIMARY KEY,
  order_no         text NOT NULL UNIQUE DEFAULT ('ORD-' || nextval('order_no_seq')),
  customer_name    text NOT NULL,
  phone            text NOT NULL,                 -- normalised 01XXXXXXXXX
  address          text NOT NULL,
  zone             text NOT NULL CHECK (zone IN ('dhaka', 'outside')),
  note             text,
  subtotal         numeric(12,2) NOT NULL,
  delivery_fee     numeric(12,2) NOT NULL,
  total            numeric(12,2) NOT NULL,
  payment_method   payment_method NOT NULL DEFAULT 'cod',
  payment_status   payment_status NOT NULL DEFAULT 'unpaid',
  status           order_status NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_phone_idx ON orders (phone, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);

-- Names and prices are copied at order time so later catalog edits never rewrite history.
CREATE TABLE order_items (
  id          bigserial PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id  int NOT NULL REFERENCES product_variants(id),
  name        text NOT NULL,
  label       text NOT NULL,
  qty         int NOT NULL CHECK (qty > 0),
  unit_price  numeric(12,2) NOT NULL,
  mrp         numeric(12,2) NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE otp_codes (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);
