// Product entry -> purchase (batch + expiry) -> storefront visibility follows stock -> adjustments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './server.js';
import { sql } from './db/client.js';
import { hashPassword } from './lib/auth.js';

const app = buildServer();
const H = { 'x-requested-with': 'medshop-admin' };

async function login(email: string, role: string) {
  await sql`INSERT INTO staff (email, name, role, password_hash) VALUES (${email}, ${'T ' + role}, ${role}, ${await hashPassword('test-password-1')})
            ON CONFLICT (email) DO UPDATE SET is_active = true, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`;
  const r = await app.inject({ method: 'POST', url: '/admin/auth/login', headers: H, payload: { email, password: 'test-password-1' } });
  return { cookie: `ms_session=${r.cookies.find((c) => c.name === 'ms_session')!.value}`, ...H };
}
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

test.before(async () => { await sql`DELETE FROM login_failures`; });
test.after(async () => {
  await sql`DELETE FROM staff WHERE email LIKE 'i-%@test.local'`;
  await app.close(); await sql.end();
});

test('new medicine is hidden until stocked, then appears; sells FEFO; hides again at zero', async () => {
  const a = await login('i-admin@test.local', 'admin');
  const inj = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, h = a) => app.inject({ method, url, headers: h, payload: payload as never });
  const name = `Zz Testmed ${Date.now()}`;

  const created = await inj('POST', '/admin/products', {
    name, generic: 'Testgeneric', strength: '250 mg', dosageForm: 'Tablet', rx: 'otc', isActive: true, isFeatured: false,
    variants: [{ label: 'Strip of 10', unit: 'Strip', barcode: `T${Date.now()}`, mrp: 50, price: 45 }],
  });
  assert.equal(created.statusCode, 201, created.body);
  const pid = created.json().id;
  const p = (await inj('GET', `/admin/products/${pid}`)).json();
  const slug = p.slug as string, vid = p.variants[0].id as number;

  // no stock yet: not listed on the storefront, direct link still opens and says out of stock
  assert.equal((await app.inject({ method: 'GET', url: `/v1/products?q=${encodeURIComponent(name)}` })).json().total, 0);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/products/${slug}` })).json().variants[0].stock, 0);

  // receive two batches: near expiry (B1, 5 units) and later (B2, 10 units)
  const buy = (items: unknown[]) => inj('POST', '/admin/purchases', { invoiceNo: 'INV-1', items });
  assert.equal((await buy([{ variantId: vid, batchNo: 'B0', expiryDate: day(-1), qty: 3, costPrice: 30 }])).statusCode, 422);   // expired on arrival
  assert.equal((await buy([
    { variantId: vid, batchNo: 'B1', expiryDate: day(90), qty: 5, costPrice: 30 },
    { variantId: vid, batchNo: 'B2', expiryDate: day(400), qty: 10, costPrice: 31 },
  ])).statusCode, 201);
  assert.equal((await buy([{ variantId: vid, batchNo: 'B1', expiryDate: day(91), qty: 1, costPrice: 30 }])).statusCode, 409);   // same batch, different expiry

  assert.equal((await app.inject({ method: 'GET', url: `/v1/products?q=${encodeURIComponent(name)}` })).json().total, 1);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/products/${slug}` })).json().variants[0].stock, 15);

  // customer order of 7 takes all 5 from B1 and 2 from B2
  await sql`DELETE FROM otp_codes WHERE phone = '01955000111'`;
  process.env.OTP_DEV = '1';
  const code = (await app.inject({ method: 'POST', url: '/v1/otp/request', payload: { phone: '01955000111' } })).json().devCode;
  const token = (await app.inject({ method: 'POST', url: '/v1/otp/verify', payload: { phone: '01955000111', code } })).json().token;
  const o = await app.inject({ method: 'POST', url: '/v1/orders', payload: { token, name: 'Test User', phone: '01955000111', address: 'House 1, Road 2, Dhaka', zone: 'dhaka', items: [{ variantId: vid, qty: 7 }] } });
  assert.equal(o.statusCode, 201, o.body);
  const batches = (await inj('GET', `/admin/stock/${vid}/batches`)).json();
  assert.deepEqual(batches.map((b: { batchNo: string; qty: number }) => [b.batchNo, b.qty]), [['B1', 0], ['B2', 8]]);

  // write off the rest -> storefront hides it again; cannot go below zero
  const b2 = batches.find((b: { batchNo: string }) => b.batchNo === 'B2').id;
  assert.equal((await inj('POST', '/admin/stock/adjust', { batchId: b2, qty: -9, reason: 'adjustment' })).statusCode, 409);
  assert.equal((await inj('POST', '/admin/stock/adjust', { batchId: b2, qty: 5, reason: 'expired_writeoff' })).statusCode, 422);
  assert.equal((await inj('POST', '/admin/stock/adjust', { batchId: b2, qty: -8, reason: 'adjustment', note: 'damaged' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/products?q=${encodeURIComponent(name)}` })).json().total, 0);

  // product used by stock/orders cannot be deleted, only deactivated; ledger cannot be edited
  assert.equal((await inj('DELETE', `/admin/products/${pid}`)).statusCode, 409);
  await assert.rejects(() => sql`DELETE FROM stock_movements WHERE batch_id = ${b2}`);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM stock_movements m JOIN batches b ON b.id = m.batch_id WHERE b.variant_id = ${vid}`;
  assert.equal(n, 5); // 2 purchases, 2 sale rows (B1 and B2), 1 write-off

  await app.inject({ method: 'POST', url: `/v1/orders/${o.json().orderNo}/cancel`, payload: { phone: '01955000111' } });
  await inj('PUT', `/admin/products/${pid}`, { ...p, generic: p.generic, companyId: null, categoryId: null, isActive: false, variants: p.variants });
  assert.equal((await app.inject({ method: 'GET', url: `/v1/products/${slug}` })).statusCode, 404);
});

test('unused medicine can be deleted; roles: cashier cannot create products or purchase', async () => {
  const a = await login('i-admin@test.local', 'admin');
  const c = await login('i-cashier@test.local', 'cashier');
  const mk = await app.inject({ method: 'POST', url: '/admin/products', headers: a, payload: { name: 'Zz Delete Me', rx: 'otc', variants: [{ label: 'x', mrp: 10, price: 10 }] } });
  assert.equal((await app.inject({ method: 'DELETE', url: `/admin/products/${mk.json().id}`, headers: a })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/admin/products', headers: c, payload: { name: 'Nope', rx: 'otc', variants: [{ label: 'x', mrp: 10, price: 10 }] } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/admin/purchases', headers: c, payload: { items: [] } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/admin/stock', headers: c })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/admin/products', headers: a, payload: { name: 'Bad', rx: 'otc', variants: [{ label: 'x', mrp: 10, price: 20 }] } })).statusCode, 400); // price above MRP
});

test('image upload accepts real images only', async () => {
  const a = await login('i-admin@test.local', 'admin');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = (data: Buffer, name: string) => {
    const b = '----t'; const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`), data, Buffer.from(`\r\n--${b}--\r\n`)]);
    return { body, headers: { ...a, 'content-type': `multipart/form-data; boundary=${b}` } };
  };
  const ok = form(png, 'a.png');
  const r = await app.inject({ method: 'POST', url: '/admin/uploads', payload: ok.body, headers: ok.headers });
  assert.equal(r.statusCode, 201, r.body);
  assert.match(r.json().url, /^\/uploads\/[0-9a-f]{24}\.png$/);
  assert.equal((await app.inject({ method: 'GET', url: r.json().url })).statusCode, 200);
  const bad = form(Buffer.from('<script>alert(1)</script>'), 'evil.png');
  assert.equal((await app.inject({ method: 'POST', url: '/admin/uploads', payload: bad.body, headers: bad.headers })).statusCode, 415);
});
