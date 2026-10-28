-- Starter catalogue rows carry placeholder prices and brand details; a person must confirm them.
ALTER TABLE products ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
