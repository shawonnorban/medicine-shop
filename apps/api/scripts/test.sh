#!/usr/bin/env bash
# Runs the API tests against a throw-away database so they never touch the development data.
# The test database gets the same schema and seed, but with large stock (SEED_STOCK=test) so sales tests have goods to sell.
set -euo pipefail
ADMIN_URL="${ADMIN_DATABASE_URL:-postgres://medshop:medshop@localhost:5432/postgres}"
export DATABASE_URL="${TEST_DATABASE_URL:-postgres://medshop:medshop@localhost:5432/medshop_test}"
export NODE_ENV=test

psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = 'medshop_test'" | grep -q 1 || psql "$ADMIN_URL" -qc "CREATE DATABASE medshop_test"
npx tsx src/db/migrate.ts >/dev/null
SEED_STOCK=test npx tsx src/db/seed.ts >/dev/null
exec npx tsx --test --test-concurrency=1 src/orders.test.ts src/admin.test.ts src/inventory.test.ts src/pos.test.ts
