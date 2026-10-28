import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cancelOrder, createOrder, getOrder, OrderError } from '../lib/orders.js';
import { checkToken, normalisePhone, requestOtp, verifyOtp } from '../lib/otp.js';

const phone = z.string().transform((s, ctx) => {
  const p = normalisePhone(s);
  if (!p) ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
  return p as string;
});

const orderBody = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2).max(80),
  phone,
  address: z.string().trim().min(8).max(300),
  zone: z.enum(['dhaka', 'outside']),
  note: z.string().trim().max(300).optional(),
  items: z.array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(50) })).min(1).max(40),
});

export async function orderRoutes(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof OrderError) return reply.status(err.statusCode).send({ error: err.code, detail: err.detail });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_request', issues: err.issues.map((i) => i.message) });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error' });
  });

  app.post('/otp/request', async (req) => {
    const { phone: p } = z.object({ phone }).parse(req.body);
    return { sent: true, ...(await requestOtp(p)) };
  });

  app.post('/otp/verify', async (req, reply) => {
    const body = z.object({ phone, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const token = await verifyOtp(body.phone, body.code);
    if (!token) return reply.status(400).send({ error: 'invalid_code' });
    return { token };
  });

  app.post('/orders', async (req, reply) => {
    const b = orderBody.parse(req.body);
    if (!checkToken(b.phone, b.token)) return reply.status(401).send({ error: 'phone_not_verified' });
    const result = await createOrder(b);
    return reply.status(201).send(result);
  });

  app.get('/orders/:orderNo', async (req, reply) => {
    const { orderNo } = z.object({ orderNo: z.string().max(30) }).parse(req.params);
    const { phone: p } = z.object({ phone }).parse(req.query);
    const o = await getOrder(orderNo, p);
    if (!o) return reply.status(404).send({ error: 'not_found' });
    reply.header('cache-control', 'no-store');
    return o;
  });

  app.post('/orders/:orderNo/cancel', async (req) => {
    const { orderNo } = z.object({ orderNo: z.string().max(30) }).parse(req.params);
    const { phone: p } = z.object({ phone }).parse(req.body);
    return cancelOrder(orderNo, p);
  });
}
