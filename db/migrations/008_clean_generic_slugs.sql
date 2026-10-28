-- Slugs backfilled in 006 carried the row id; use the plain name wherever that is unambiguous.
UPDATE generics g SET slug = b.base
FROM (SELECT id, trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) AS base FROM generics) b
WHERE g.id = b.id AND b.base <> '' AND g.slug = b.base || '-' || g.id
  AND NOT EXISTS (SELECT 1 FROM generics o WHERE o.slug = b.base AND o.id <> g.id)
  AND (SELECT count(*) FROM generics x WHERE trim(both '-' from regexp_replace(lower(x.name), '[^a-z0-9]+', '-', 'g')) = b.base) = 1;
