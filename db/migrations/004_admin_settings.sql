-- Staff accounts, sessions, audit trail, and everything the store owner can configure.
CREATE TYPE staff_role AS ENUM ('admin', 'pharmacist', 'cashier');

CREATE TABLE staff (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  role          staff_role NOT NULL,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Only a hash of the session token is stored, so a database leak does not leak live sessions.
CREATE TABLE staff_sessions (
  token_hash  text PRIMARY KEY,
  staff_id    int NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_sessions_staff_idx ON staff_sessions (staff_id);

CREATE TABLE login_failures (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_failures_email_idx ON login_failures (email, created_at DESC);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  staff_id    int REFERENCES staff(id) ON DELETE SET NULL,
  staff_name  text,
  action      text NOT NULL,            -- e.g. 'delivery_zone.update'
  entity      text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);

-- Free-form store settings (name, phone, licence number ...). Public ones are served to the storefront.
CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_zones (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,     -- stored on orders
  name_bn     text NOT NULL,
  fee         numeric(12,2) NOT NULL CHECK (fee >= 0),
  free_over   numeric(12,2) CHECK (free_over IS NULL OR free_over > 0),   -- NULL = never free
  eta_text    text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0
);

CREATE TABLE payment_methods (
  code          payment_method PRIMARY KEY,
  name_bn       text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT false,
  instructions  text,
  sort_order    int NOT NULL DEFAULT 0
);

-- Orders keep the zone code as text; the zone table can now grow beyond two rows.
ALTER TABLE orders DROP CONSTRAINT orders_zone_check;

INSERT INTO delivery_zones (code, name_bn, fee, free_over, eta_text, sort_order) VALUES
  ('dhaka',   'ঢাকার ভেতরে', 60,  1500, '১–২ দিন', 0),
  ('outside', 'ঢাকার বাইরে', 120, 1500, '৩–৫ দিন', 1);

INSERT INTO payment_methods (code, name_bn, is_enabled, instructions, sort_order) VALUES
  ('cod',   'ক্যাশ অন ডেলিভারি', true,  'পণ্য হাতে পেয়ে টাকা দিন।', 0),
  ('bkash', 'bKash',            false, NULL, 1),
  ('nagad', 'Nagad',            false, NULL, 2);

INSERT INTO settings (key, value) VALUES
  ('store_name',      '"আপনার ফার্মেসি"'),
  ('tagline',         '"স্বাস্থ্য আমাদের অগ্রাধিকার"'),
  ('phone',           '"+880 1XXX-XXXXXX"'),
  ('whatsapp',        '""'),
  ('email',           '"info@example.com"'),
  ('address',         '"আপনার ঠিকানা, ঢাকা"'),
  ('drug_license',    '"DGDA-XXXX"'),
  ('pharmacist_name', '""'),
  ('pharmacist_reg',  '""'),
  ('hours_text',      '"সকাল ৯টা – রাত ১০টা"'),
  ('facebook_url',    '""'),
  ('announcement',    '"সারা বাংলাদেশে হোম ডেলিভারি"');
