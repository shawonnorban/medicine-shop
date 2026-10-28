// Usage: STAFF_PASSWORD=... tsx src/scripts/create-staff.ts email "Name" admin|pharmacist|cashier
import { sql } from '../db/client.js';
import { hashPassword } from '../lib/auth.js';

const [email, name, role = 'admin'] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD;
if (!email || !name || !password || password.length < 10 || !['admin', 'pharmacist', 'cashier'].includes(role)) {
  console.error('Usage: STAFF_PASSWORD=<min 10 chars> tsx src/scripts/create-staff.ts <email> "<name>" [admin|pharmacist|cashier]');
  process.exit(1);
}
await sql`
  INSERT INTO staff (email, name, role, password_hash) VALUES (${email.toLowerCase()}, ${name}, ${role}, ${await hashPassword(password)})
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, is_active = true`;
console.log(`staff ${email} (${role}) saved`);
await sql.end();
