ALTER TABLE products ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
CREATE INDEX products_featured_idx ON products (id) WHERE is_featured AND is_active;
