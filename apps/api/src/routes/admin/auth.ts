import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { login, logout, requirePerm, SESSION_COOKIE, SESSION_HOURS, staffFromToken } from '../../lib/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    if (req.headers['x-requested-with'] !== 'medshop-admin') return reply.status(403).send({ error: 'csrf' });
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const r = await login(email, password, req.ip);
    if (r === 'locked') return reply.status(429).send({ error: 'too_many_attempts' });
    if (!r) return reply.status(401).send({ error: 'invalid_credentials' });
    reply.setCookie(SESSION_COOKIE, r.token, {
      httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_HOURS * 3600,
    });
    return { staff: r.staff };
  });

  app.get('/auth/me', async (req, reply) => {
    const staff = await staffFromToken(req.cookies[SESSION_COOKIE]);
    if (!staff) return reply.status(401).send({ error: 'unauthenticated' });
    return { staff };
  });

  app.post('/auth/logout', { preHandler: requirePerm('self') }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
