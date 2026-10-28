// Admin API: auth, roles, settings CRUD effects on public config and checkout, order status flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './server.js';
import { sql } from './db/client.js';
import { hashPassword } from './lib/auth.js';

process.env.OTP_DEV = '1';
const app = buildServer();
const H = { 'x-requested-with': 'medshop-admin' };
const PHONE = '01911000111';

async function mkStaff(email: string, role: string) {
  await sql`INSERT INTO staff (email, name, role, password_hash) VALUES (${email}, ${'T ' + role}, ${role}, ${await hashPassword('test-password-1')})
            ON CONFLICT (email) DO UPDATE SET is_active = true, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`;
}
async function login(email: string) {
  const r = await app.inject({ method: 'POST', url: '/admin/auth/login', headers: H, payload: { email, password: 'test-password-1' } });
  assert.equal(r.statusCode, 200, r.body);
  const c = r.cookies.find((x) => x.name === 'ms_session')!;
  return { cookie: `ms_session=${c.value}`, ...H };
}

test.before(async () => {
  await sql`DELETE FROM login_failures`; await sql`DELETE FROM otp_codes`;
  await mkStaff('t-admin@test.local', 'admin'); await mkStaff('t-cashier@test.local', 'cashier'); await mkStaff('t-pharm@test.local', 'pharmacist');
});
test.after(async () => {
  await sql`DELETE FROM staff WHERE email LIKE 't-%@test.local'`;
  await sql`DELETE FROM delivery_zones WHERE code LIKE 'tzone%'`;
  await app.close(); await sql.end();
});

test('auth: needs login, csrf header, lockout after failures, roles enforced', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/admin/settings/store' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/admin/auth/login', payload: { email: 't-admin@test.local', password: 'test-password-1' } })).statusCode, 403);

  const cashier = await login('t-cashier@test.local');
  assert.equal((await app.inject({ method: 'GET', url: '/admin/settings/store', headers: cashier })).statusCode, 403);   // settings = admin only
  assert.equal((await app.inject({ method: 'GET', url: '/admin/orders', headers: cashier })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PUT', url: '/admin/orders/ORD-1/status', headers: cashier, payload: { status: 'confirmed' } })).statusCode, 403);
  // a state-changing call without the csrf header is refused even with a valid cookie
  assert.equal((await app.inject({ method: 'PUT', url: '/admin/settings/store', headers: { cookie: cashier.cookie }, payload: {} })).statusCode, 403);

  for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/admin/auth/login', headers: H, payload: { email: 't-pharm@test.local', password: 'wrong-password' } });
  const locked = await app.inject({ method: 'POST', url: '/admin/auth/login', headers: H, payload: { email: 't-pharm@test.local', password: 'test-password-1' } });
  assert.equal(locked.statusCode, 429);
  await sql`DELETE FROM login_failures`;
});

test('settings: delivery zone edits change the public config and the order total; delete is guarded', async () => {
  const a = await login('t-admin@test.local');
  const inj = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, headers: a, payload: payload as never });

  const zones = (await inj('GET', '/admin/delivery-zones')).json();
  const dhaka = zones.find((z: { code: string }) => z.code === 'dhaka');
  const orig = { nameBn: dhaka.nameBn, fee: dhaka.fee, freeOver: dhaka.freeOver, eta: dhaka.eta, isActive: true, sortOrder: dhaka.sortOrder };

  assert.equal((await inj('PUT', `/admin/delivery-zones/${dhaka.id}`, { ...orig, fee: 99 })).statusCode, 200);
  const cfg = (await app.inject({ method: 'GET', url: '/v1/config' })).json();
  assert.equal(cfg.zones.find((z: { code: string }) => z.code === 'dhaka').fee, 99);

  // place an order: fee must follow the edited zone
  const [v] = await sql`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'napa-500-mg-tablet' ORDER BY v.id LIMIT 1`;
  const code = (await app.inject({ method: 'POST', url: '/v1/otp/request', payload: { phone: PHONE } })).json().devCode;
  const token = (await app.inject({ method: 'POST', url: '/v1/otp/verify', payload: { phone: PHONE, code } })).json().token;
  const order = { token, name: 'Test User', phone: PHONE, address: 'House 1, Road 2, Dhaka', items: [{ variantId: v.id, qty: 1 }] };
  const o1 = await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...order, zone: 'dhaka' } });
  assert.equal(o1.statusCode, 201);
  assert.equal(o1.json().deliveryFee, 99);

  // new zone, then it is usable; disabled zone is not
  const mk = await inj('POST', '/admin/delivery-zones', { code: 'tzone1', nameBn: 'টেস্ট', fee: 10, freeOver: null, isActive: true, sortOrder: 9 });
  assert.equal(mk.statusCode, 201);
  assert.equal((await inj('POST', '/admin/delivery-zones', { code: 'tzone1', nameBn: 'ডুপ', fee: 10, freeOver: null })).statusCode, 409);
  const o2 = await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...order, zone: 'tzone1' } });
  assert.equal(o2.json().deliveryFee, 10);
  assert.equal((await inj('DELETE', `/admin/delivery-zones/${mk.json().id}`)).statusCode, 409);   // used by an order -> in_use
  await inj('PUT', `/admin/delivery-zones/${mk.json().id}`, { nameBn: 'টেস্ট', fee: 10, freeOver: null, isActive: false, sortOrder: 9 });
  assert.equal((await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...order, zone: 'tzone1' } })).json().error, 'invalid_zone');

  // free-over threshold
  await inj('PUT', `/admin/delivery-zones/${dhaka.id}`, { ...orig, fee: 99, freeOver: 1 });
  const o3 = await app.inject({ method: 'POST', url: '/v1/orders', payload: { ...order, zone: 'dhaka' } });
  assert.equal(o3.json().deliveryFee, 0);

  // restore
  await inj('PUT', `/admin/delivery-zones/${dhaka.id}`, orig);
  for (const n of [o1.json().orderNo, o2.json().orderNo, o3.json().orderNo]) await app.inject({ method: 'POST', url: `/v1/orders/${n}/cancel`, payload: { phone: PHONE } });
  const freeOne = (await app.inject({ method: 'GET', url: '/v1/config' })).json();
  assert.equal(freeOne.zones.find((z: { code: string }) => z.code === 'dhaka').fee, orig.fee);
});

test('settings: store info update shows in public config; unknown keys rejected; bKash cannot be enabled yet; audit written', async () => {
  const a = await login('t-admin@test.local');
  const before = (await app.inject({ method: 'GET', url: '/admin/settings/store', headers: a })).json();
  assert.equal((await app.inject({ method: 'PUT', url: '/admin/settings/store', headers: a, payload: { phone: '01700000001' } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/config' })).json().store.phone, '01700000001');
  assert.equal((await app.inject({ method: 'PUT', url: '/admin/settings/store', headers: a, payload: { evil: 'x' } })).statusCode, 400);
  await app.inject({ method: 'PUT', url: '/admin/settings/store', headers: a, payload: { phone: before.phone } });

  const r = await app.inject({ method: 'PUT', url: '/admin/payment-methods/bkash', headers: a, payload: { nameBn: 'bKash', isEnabled: true, instructions: null } });
  assert.equal(r.statusCode, 409);
  const logs = (await app.inject({ method: 'GET', url: '/admin/audit-logs?limit=5', headers: a })).json();
  assert.ok(logs.some((l: { action: string }) => l.action === 'settings.store.update'));
});

test('orders: status flow enforced, cancel restores stock, COD marked paid on delivery', async () => {
  const a = await login('t-admin@test.local');
  const [v] = await sql`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'napa-500-mg-tablet' ORDER BY v.id LIMIT 1`;
  const stock = async () => (await sql`SELECT COALESCE(SUM(m.qty),0)::int AS q FROM stock_movements m JOIN batches b ON b.id = m.batch_id WHERE b.variant_id = ${v.id}`)[0].q as number;
  const s0 = await stock();
  await sql`DELETE FROM otp_codes WHERE phone = '01911000222'`;
  const code = (await app.inject({ method: 'POST', url: '/v1/otp/request', payload: { phone: '01911000222' } })).json().devCode;
  const token = (await app.inject({ method: 'POST', url: '/v1/otp/verify', payload: { phone: '01911000222', code } })).json().token;
  const mkOrder = async () => (await app.inject({ method: 'POST', url: '/v1/orders', payload: { token, name: 'Test User', phone: '01911000222', address: 'House 1, Road 2, Dhaka', zone: 'dhaka', items: [{ variantId: v.id, qty: 2 }] } })).json().orderNo as string;
  const put = (no: string, body: unknown) => app.inject({ method: 'PUT', url: `/admin/orders/${no}/status`, headers: a, payload: body as never });

  const n1 = await mkOrder();
  assert.equal((await put(n1, { status: 'delivered' })).statusCode, 409);          // cannot skip steps
  for (const s of ['confirmed', 'processing', 'shipped', 'delivered']) assert.equal((await put(n1, { status: s })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: `/admin/orders/${n1}`, headers: a })).json().paymentStatus, 'paid');
  assert.equal((await put(n1, { status: 'cancelled' })).statusCode, 409);          // delivered is final

  const n2 = await mkOrder();
  assert.equal(await stock(), s0 - 4);
  assert.equal((await put(n2, { status: 'cancelled' })).statusCode, 200);
  assert.equal(await stock(), s0 - 2);                                              // only n1 remains out
  await sql`INSERT INTO stock_movements (batch_id, qty, reason, ref_type) SELECT b.id, 2, 'adjustment', 'test' FROM batches b WHERE b.variant_id = ${v.id} AND b.batch_no = 'B-B'`;
  assert.equal(await stock(), s0);
});
