// Prints counts that `pnpm setup` uses to decide what is still missing. Machine-readable on purpose.
import { sql } from './client.js';

const [p] = await sql`SELECT count(*)::int AS n FROM products`;
const [a] = await sql`SELECT count(*)::int AS n FROM staff WHERE role = 'admin' AND is_active`;
console.log(`PRODUCTS=${p.n} ADMINS=${a.n}`);
await sql.end();
