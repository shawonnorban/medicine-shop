-- Any code path that creates a generic (admin, seed, import) gets a unique slug automatically.
CREATE FUNCTION generics_set_slug() RETURNS trigger AS $$
DECLARE base text;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := trim(both '-' from regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'));
    IF base = '' THEN base := 'generic'; END IF;
    NEW.slug := CASE WHEN EXISTS (SELECT 1 FROM generics WHERE slug = base) THEN base || '-' || NEW.id ELSE base END;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER generics_slug BEFORE INSERT ON generics FOR EACH ROW EXECUTE FUNCTION generics_set_slug();
