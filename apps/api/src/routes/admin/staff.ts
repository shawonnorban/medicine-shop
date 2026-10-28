import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { audit, hashPassword, requirePerm } from '../../lib/auth.js';

const idParam = z.object({ id: z.coerce.number().int() });
const role = z.enum(['admin', 'pharmacist', 'cashier']);
const password = z.string().min(10, 'password_too_short').max(200);

export async function staffRoutes(app: FastifyInstance) {
  const admin = { preHandler: requirePerm('staff') };
  const cols = sql`id, email, name, role, is_active AS "isActive", last_login_at AS "lastLoginAt"`;

  app.get('/staff', admin, async () => sql`SELECT ${cols} FROM staff ORDER BY id`);

  app.post('/staff', admin, async (req, reply) => {
    const b = z.object({ email: z.string().email(), name: z.string().trim().min(2).max(80), role, password }).parse(req.body);
    const [s] = await sql`
      INSERT INTO staff (email, name, role, password_hash) VALUES (${b.email.toLowerCase()}, ${b.name}, ${b.role}, ${await hashPassword(b.password)})
      ON CONFLICT (email) DO NOTHING RETURNING id`;
    if (!s) return reply.status(409).send({ error: 'duplicate_email' });
    await audit(req, 'staff.create', 'staff', s.id, { email: b.email, role: b.role });
    return reply.status(201).send(s);
  });

  app.put('/staff/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ name: z.string().trim().min(2).max(80), role, isActive: z.boolean(), password: password.optional() }).parse(req.body);
    // never let the last active admin be demoted or deactivated (lock-out protection)
    if (id === req.staff!.id && (b.role !== 'admin' || !b.isActive)) return reply.status(409).send({ error: 'self_lockout' });
    const r = await sql`UPDATE staff SET name = ${b.name}, role = ${b.role}, is_active = ${b.isActive} WHERE id = ${id} RETURNING id`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    if (b.password) await sql`UPDATE staff SET password_hash = ${await hashPassword(b.password)} WHERE id = ${id}`;
    if (!b.isActive || b.password) await sql`DELETE FROM staff_sessions WHERE staff_id = ${id}`; // force re-login
    await audit(req, 'staff.update', 'staff', id, { role: b.role, isActive: b.isActive, passwordChanged: !!b.password });
    return { ok: true };
  });

  app.delete('/staff/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (id === req.staff!.id) return reply.status(409).send({ error: 'self_delete' });
    const r = await sql`DELETE FROM staff WHERE id = ${id} RETURNING email`;
    if (!r.length) return reply.status(404).send({ error: 'not_found' });
    await audit(req, 'staff.delete', 'staff', id, { email: r[0].email });
    return { ok: true };
  });

  app.get('/audit-logs', admin, async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    return sql`SELECT id, staff_name AS "staffName", action, entity, entity_id AS "entityId", detail, created_at AS "createdAt" FROM audit_logs ORDER BY id DESC LIMIT ${limit}`;
  });
}
