-- Generic library: one record per active ingredient, with the reference text shown on the product page.
ALTER TABLE generics
  ADD COLUMN slug text,
  ADD COLUMN drug_class text,
  ADD COLUMN indications text,
  ADD COLUMN dosage_info text,
  ADD COLUMN side_effects text,
  ADD COLUMN contraindications text,
  ADD COLUMN interactions text,
  ADD COLUMN pregnancy_note text,
  ADD COLUMN storage_info text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE generics SET slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) || '-' || id WHERE slug IS NULL;
ALTER TABLE generics ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX generics_slug_idx ON generics (slug);
