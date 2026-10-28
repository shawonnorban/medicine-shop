// Waits until PostgreSQL accepts connections (used by `pnpm setup` right after starting the container).
import { sql } from './client.js';

const tries = Number(process.argv[2] ?? 30);
for (let i = 1; i <= tries; i++) {
  try { await sql`SELECT 1`; await sql.end(); console.log('database is ready'); process.exit(0); }
  catch { if (i === tries) break; await new Promise((r) => setTimeout(r, 1000)); }
}
console.error('database is not reachable');
process.exit(1);
