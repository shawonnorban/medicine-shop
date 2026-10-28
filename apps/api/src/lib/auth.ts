import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sql } from '../db/client.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'ms_session';
export const SESSION_HOURS = 12;
const MAX_FAILURES = 5;

export type Role = 'admin' | 'pharmacist' | 'cashier';
export type Staff = { id: number; email: string; name: string; role: Role };

/** What each role may do. Admin may do everything. */
const PERMS: Record<Role, string[]> = {
  admin: ['*'],
  pharmacist: ['self', 'orders.read', 'orders.update', 'catalog.read', 'products.write', 'stock.read', 'stock.write'],
  cashier: ['self', 'orders.read', 'catalog.read', 'stock.read'],
};
export const can = (role: Role, perm: string) => PERMS[role].includes('*') || PERMS[role].includes(perm);

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(keyHex, 'hex');
  return key.length === want.length && timingSafeEqual(key, want);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function login(email: string, password: string, ip: string): Promise<{ token: string; staff: Staff } | 'locked' | null> {
  const mail = email.trim().toLowerCase();
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM login_failures WHERE email = ${mail} AND created_at > now() - interval '15 minutes'`;
  if (n >= MAX_FAILURES) return 'locked';

  const [row] = await sql`SELECT id, email, name, role, password_hash, is_active FROM staff WHERE email = ${mail}`;
  // always run a hash comparison so response time does not reveal whether the email exists
  const ok = await checkPassword(password, row?.password_hash ?? 'scrypt$00$00');
  if (!row || !row.is_active || !ok) {
    await sql`INSERT INTO login_failures (email, ip) VALUES (${mail}, ${ip})`;
    return null;
  }
  await sql`DELETE FROM login_failures WHERE email = ${mail}`;
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES (${sha(token)}, ${row.id}, now() + ${SESSION_HOURS + ' hours'}::interval)`;
  await sql`UPDATE staff SET last_login_at = now() WHERE id = ${row.id}`;
  return { token, staff: { id: row.id, email: row.email, name: row.name, role: row.role } };
}

export async function logout(token: string) {
  await sql`DELETE FROM staff_sessions WHERE token_hash = ${sha(token)}`;
}

export async function staffFromToken(token: string | undefined): Promise<Staff | null> {
  if (!token) return null;
  const [row] = await sql`
    SELECT s.id, s.email, s.name, s.role FROM staff_sessions t JOIN staff s ON s.id = t.staff_id
    WHERE t.token_hash = ${sha(token)} AND t.expires_at > now() AND s.is_active`;
  return row ? { id: row.id, email: row.email, name: row.name, role: row.role } : null;
}

declare module 'fastify' {
  interface FastifyRequest { staff?: Staff }
}

/** preHandler factory: requires a valid session and the given permission. */
export const requirePerm = (perm: string) => async (req: FastifyRequest, reply: FastifyReply) => {
  // Cookie auth + a required custom header blocks cross-site form posts (CSRF) on top of SameSite.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'medshop-admin') {
    return reply.status(403).send({ error: 'csrf' });
  }
  const staff = await staffFromToken(req.cookies[SESSION_COOKIE]);
  if (!staff) return reply.status(401).send({ error: 'unauthenticated' });
  if (!can(staff.role, perm)) return reply.status(403).send({ error: 'forbidden' });
  req.staff = staff;
};

export async function audit(req: FastifyRequest, action: string, entity?: string, entityId?: string | number, detail?: unknown) {
  await sql`
    INSERT INTO audit_logs (staff_id, staff_name, action, entity, entity_id, detail)
    VALUES (${req.staff?.id ?? null}, ${req.staff?.name ?? null}, ${action}, ${entity ?? null}, ${entityId == null ? null : String(entityId)},
            ${detail === undefined ? null : sql.json(detail as never)})`;
}
