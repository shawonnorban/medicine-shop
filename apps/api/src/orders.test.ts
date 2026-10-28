// Integration test against the seeded dev database: OTP -> order -> FEFO stock -> cancel restores stock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './server.js';
import { sql } from './db/client.js';

process.env.OTP_DEV = '1';
const app = buildServer();
const PHONE = '01712345678';

const stockOf = async (variantId: number) =>
  (await sql`SELECT COALESCE(SUM(m.qty),0)::int AS q FROM stock_movements m JOIN batches b ON b.id = m.batch_id WHERE b.variant_id = ${variantId}`)[0].q as number;

async function verified() {
  const r = await app.inject({ method: 'POST', url: '/v1/otp/request', payload: { phone: '+880 1712-345678' } });
  assert.equal(r.statusCode, 200);
  const { devCode } = r.json();
  const v = await app.inject({ method: 'POST', url: '/v1/otp/verify', payload: { phone: PHONE, code: devCode } });
  assert.equal(v.statusCode, 200);
  return v.json().token as string;
}

test.before(async () => { await sql`DELETE FROM otp_codes`; });
test.after(async () => { await app.close(); await sql.end(); });

test('order flow: price from server, FEFO, cancel restores stock', async () => {
  const [v] = await sql`SELECT v.id, v.price FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'napa-500-mg-tablet' ORDER BY v.id LIMIT 1`;
  const before = await stockOf(v.id);
  const batchRem = async (no: string) => (await sql`SELECT COALESCE(SUM(m.qty),0)::int AS q FROM stock_movements m JOIN batches b ON b.id = m.batch_id WHERE b.variant_id = ${v.id} AND b.batch_no = ${no}`)[0].q as number;
  const nearBefore = await batchRem('B-A');
  const token = await verified();

  const res = await app.inject({ method: 'POST', url: '/v1/orders', payload: {
    token, name: 'Test User', phone: PHONE, address: 'House 1, Road 2, Dhanmondi, Dhaka', zone: 'dhaka',
    items: [{ variantId: v.id, qty: 3 }, { variantId: v.id, qty: 2 }, ],
  } });
  assert.equal(res.statusCode, 201, res.body);
  const o = res.json();
  assert.equal(o.subtotal, v.price * 5);          // duplicate lines merged, price taken from DB
  assert.equal(o.deliveryFee, 60);
  assert.equal(await stockOf(v.id), before - 5);

  // earliest-expiry batch (B-A) is consumed first
  assert.equal(await batchRem('B-A'), nearBefore - 5);

  const got = await app.inject({ method: 'GET', url: `/v1/orders/${o.orderNo}?phone=${PHONE}` });
  assert.equal(got.json().items[0].qty, 5);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/orders/${o.orderNo}?phone=01812345678` })).statusCode, 404);

  const c = await app.inject({ method: 'POST', url: `/v1/orders/${o.orderNo}/cancel`, payload: { phone: PHONE } });
  assert.equal(c.json().status, 'cancelled');
  assert.equal(await stockOf(v.id), before);
  // cancelling twice does not restore twice
  await app.inject({ method: 'POST', url: `/v1/orders/${o.orderNo}/cancel`, payload: { phone: PHONE } });
  assert.equal(await stockOf(v.id), before);
});

test('rejects: unverified phone, Rx item, oversell, bad code', async () => {
  const token = await verified();
  const [otc] = await sql`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'centrum-multivitamin-tablet' ORDER BY v.id LIMIT 1`;
  const [rx] = await sql`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.rx <> 'otc' LIMIT 1`;
  const base = { name: 'Test User', phone: PHONE, address: 'House 1, Road 2, Dhaka', zone: 'outside' };

  assert.equal((await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...base, token: 'fake-phone.1.fake-signature', items: [{ variantId: otc.id, qty: 1 }] } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...base, token, items: [{ variantId: rx.id, qty: 1 }] } })).json().error, 'prescription_required');

  const stock = await stockOf(otc.id);
  const over = await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...base, token, items: [{ variantId: otc.id, qty: 50 }] } });
  if (stock < 50) { assert.equal(over.json().error, 'insufficient_stock'); assert.equal(await stockOf(otc.id), stock); }

  const bad = await app.inject({ method: 'POST', url: '/v1/otp/verify', payload: { phone: PHONE, code: '000000' } });
  assert.equal(bad.statusCode, 400);
});

test('concurrent orders never oversell', async () => {
  const [v] = await sql`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'omron-bp-monitor-hem-7121' ORDER BY v.id LIMIT 1`;
  const before = await stockOf(v.id);
  const token = await verified();
  const base = { token, name: 'Test User', phone: PHONE, address: 'House 1, Road 2, Dhaka', zone: 'dhaka' };
  const qty = Math.ceil(before / 2) + 1; // two of these cannot both fit
  const rs = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/v1/orders', payload: { ...base, items: [{ variantId: v.id, qty }] } })));
  const codes = rs.map((r) => r.statusCode).sort();
  assert.deepEqual(codes, [201, 422]);
  assert.ok((await stockOf(v.id)) >= 0);
  // clean up
  const ok = rs.find((r) => r.statusCode === 201)!.json();
  await app.inject({ method: 'POST', url: `/v1/orders/${ok.orderNo}/cancel`, payload: { phone: PHONE } });
  assert.equal(await stockOf(v.id), before);
});
