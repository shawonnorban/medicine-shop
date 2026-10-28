// Counter sales: shifts, mixed strip+piece bills, FEFO, payments/change, discount cap, Rx rules, void, returns, shift close.
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
async function cleanup() {
  const staff = await sql`SELECT id FROM staff WHERE email LIKE 'p-%@test.local'`;
  const ids = staff.map((s) => s.id as number);
  if (!ids.length) return;
  await sql`DELETE FROM pos_returns WHERE staff_id IN ${sql(ids)}`;
  await sql`DELETE FROM pos_sales WHERE staff_id IN ${sql(ids)}`;
  await sql`DELETE FROM pos_shifts WHERE staff_id IN ${sql(ids)}`;
  await sql`DELETE FROM pos_held_bills WHERE staff_id IN ${sql(ids)}`;
}

test.before(async () => { await sql`DELETE FROM login_failures`; await cleanup(); });
test.after(async () => { await cleanup(); await sql`DELETE FROM staff WHERE email LIKE 'p-%@test.local'`; await app.close(); await sql.end(); });

async function napa() {
  const rows = await sql`SELECT v.id, v.label, v.pieces, v.price, p.id AS pid FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'napa-500-mg-tablet' ORDER BY v.sort_order`;
  return { strip: rows[0], piece: rows[1], box: rows[2], pid: rows[0].pid as number };
}
const units = async (pid: number) => (await sql`SELECT COALESCE(SUM(qty_on_hand), 0)::int AS q FROM batches WHERE product_id = ${pid}`)[0].q as number;

test('shift is required; sale mixes strips and loose pieces from one pool, FEFO, change given', async () => {
  const c = await login('p-cashier@test.local', 'cashier');
  const post = (url: string, payload: unknown, h = c) => app.inject({ method: 'POST', url, headers: h, payload: payload as never });
  const { strip, piece, pid } = await napa();
  const sale = { items: [{ variantId: strip.id, qty: 2 }, { variantId: piece.id, qty: 3 }], payments: [{ method: 'cash', amount: 100 }] };

  assert.equal((await post('/admin/pos/sales', sale)).json().error, 'no_open_shift');
  assert.equal((await post('/admin/pos/shift/open', { openingCash: 500 })).statusCode, 201);
  assert.equal((await post('/admin/pos/shift/open', { openingCash: 500 })).statusCode, 409);

  const before = await units(pid);
  const [{ q: nearBefore }] = await sql`SELECT qty_on_hand AS q FROM batches WHERE product_id = ${pid} AND batch_no = 'B-A'`;
  const r = await post('/admin/pos/sales', sale);
  assert.equal(r.statusCode, 201, r.body);
  const s = r.json();
  assert.equal(s.subtotal, 2 * Number(strip.price) + 3 * Number(piece.price));          // 24 + 3.6
  assert.equal(s.total, s.subtotal);
  assert.equal(s.changeDue, 100 - s.total);
  assert.equal(s.payments[0].amount, s.total);                                         // cash recorded net of change
  assert.equal(await units(pid), before - 23);                                         // 2 strips (20) + 3 pieces
  const [{ q: nearAfter }] = await sql`SELECT qty_on_hand AS q FROM batches WHERE product_id = ${pid} AND batch_no = 'B-A'`;
  assert.equal(nearAfter, nearBefore - 23);                                            // earliest expiry first
  assert.equal(s.items[0].batches[0].batchNo, 'B-A');
  assert.match(s.invoiceNo, /^INV-\d+$/);
  assert.equal(s.store.store_name.length > 0, true);                                   // receipt data included

  // payment rules
  assert.equal((await post('/admin/pos/sales', { ...sale, payments: [{ method: 'cash', amount: 10 }] })).json().error, 'underpaid');
  assert.equal((await post('/admin/pos/sales', { ...sale, payments: [{ method: 'card', amount: 500 }] })).json().error, 'overpaid_non_cash');
  const split = await post('/admin/pos/sales', { items: [{ variantId: piece.id, qty: 5 }], payments: [{ method: 'bkash', amount: 2 }, { method: 'cash', amount: 10 }] });
  assert.equal(split.statusCode, 201, split.body);
  assert.deepEqual(split.json().payments.map((p: { method: string; amount: number }) => [p.method, p.amount]), [['bkash', 2], ['cash', 4]]);   // 6.00 total: 2 bkash + 4 cash, 6 change
  assert.equal(split.json().changeDue, 6);
  assert.equal((await post('/admin/pos/sales', { ...sale, items: [{ variantId: strip.id, qty: 99999 }], payments: [{ method: 'cash', amount: 9999999 }] })).json().error, 'insufficient_stock');
});

test('discount cap for cashiers, Rx details, controlled rule', async () => {
  const c = await login('p-cashier@test.local', 'cashier');
  const ph = await login('p-pharm@test.local', 'pharmacist');
  const { strip } = await napa();
  const post = (h: typeof c, payload: unknown) => app.inject({ method: 'POST', url: '/admin/pos/sales', headers: h, payload: payload as never });
  await app.inject({ method: 'POST', url: '/admin/pos/shift/open', headers: ph, payload: { openingCash: 0 } });
  const base = { items: [{ variantId: strip.id, qty: 10 }], payments: [{ method: 'cash', amount: 500 }] };

  assert.equal((await post(c, { ...base, discount: { type: 'percent', value: 15 } })).json().error, 'discount_too_high');
  const ok = await post(c, { ...base, discount: { type: 'percent', value: 10 } });
  assert.equal(ok.statusCode, 201, ok.body);
  assert.equal(ok.json().discount, 12);                                    // 10% of 120
  assert.equal((await post(ph, { ...base, discount: { type: 'amount', value: 30 } })).statusCode, 201);   // pharmacist is not capped
  assert.equal((await post(ph, { ...base, discount: { type: 'amount', value: 9999 } })).json().error, 'discount_exceeds_total');

  const [rx] = await sql`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.rx = 'prescription' AND p.is_active ORDER BY v.id LIMIT 1`;
  const rxSale = { items: [{ variantId: rx.id, qty: 1 }], payments: [{ method: 'cash', amount: 1000 }] };
  assert.equal((await post(c, rxSale)).json().error, 'rx_details_required');
  const done = await post(c, { ...rxSale, patientName: 'Rahim', doctorName: 'Dr. Karim' });
  assert.equal(done.statusCode, 201, done.body);
  assert.equal(done.json().patientName, 'Rahim');

  await sql`UPDATE products SET rx = 'controlled' WHERE id = (SELECT product_id FROM product_variants WHERE id = ${rx.id})`;
  try {
    assert.equal((await post(c, { ...rxSale, patientName: 'Rahim', doctorName: 'Dr. Karim' })).json().error, 'controlled_pharmacist_only');
    assert.equal((await post(ph, { ...rxSale, patientName: 'Rahim', doctorName: 'Dr. Karim' })).statusCode, 201);
  } finally {
    await sql`UPDATE products SET rx = 'prescription' WHERE id = (SELECT product_id FROM product_variants WHERE id = ${rx.id})`;
  }
});

test('void restores stock (cashier cannot void); returns refund proportionally and put units back in their batch', async () => {
  const c = await login('p-cashier@test.local', 'cashier');
  const ph = await login('p-pharm@test.local', 'pharmacist');
  const { strip, piece, pid } = await napa();
  const call = (h: typeof c, url: string, payload: unknown, method: 'POST' | 'GET' = 'POST') => app.inject({ method, url, headers: h, payload: payload as never });

  const before = await units(pid);
  const s1 = (await call(c, '/admin/pos/sales', { items: [{ variantId: strip.id, qty: 4 }], payments: [{ method: 'cash', amount: 100 }] })).json();
  assert.equal(await units(pid), before - 40);
  assert.equal((await call(c, `/admin/pos/sales/${s1.id}/void`, { reason: 'wrong item' })).statusCode, 403);
  assert.equal((await call(ph, `/admin/pos/sales/${s1.id}/void`, { reason: 'wrong item' })).statusCode, 200);
  assert.equal(await units(pid), before);
  assert.equal((await call(ph, `/admin/pos/sales/${s1.id}/void`, { reason: 'again again' })).json().error, 'already_voided');

  // 10% discount bill: 4 strips + 5 pieces
  const s2 = (await call(ph, '/admin/pos/sales', { items: [{ variantId: strip.id, qty: 4 }, { variantId: piece.id, qty: 5 }], discount: { type: 'percent', value: 10 }, payments: [{ method: 'cash', amount: 200 }] })).json();
  const afterSale = await units(pid);
  const stripItem = s2.items.find((i: { label: string }) => i.label === strip.label);
  const ret = await call(ph, `/admin/pos/sales/${s2.id}/return`, { items: [{ itemId: stripItem.id, qty: 1 }], reason: 'customer changed mind' });
  assert.equal(ret.statusCode, 200, ret.body);
  assert.equal(ret.json().refund, Math.round(Number(strip.price) * (s2.total / s2.subtotal) * 100) / 100);     // price x discount ratio
  assert.equal(await units(pid), afterSale + 10);
  assert.equal((await call(ph, `/admin/pos/sales/${s2.id}/return`, { items: [{ itemId: stripItem.id, qty: 4 }], reason: 'too many' })).json().error, 'return_exceeds_sold');
  assert.equal((await call(ph, `/admin/pos/sales/${s2.id}/void`, { reason: 'late void' })).json().error, 'has_returns');
});

test('shift report and close: expected cash = opening + cash sales - refunds; held bills; search and alternatives', async () => {
  const ph = await login('p-pharm@test.local', 'pharmacist');
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, headers: ph, payload: payload as never });

  const cur = (await call('GET', '/admin/pos/shift')).json();
  assert.ok(cur.shift);
  const rep = cur.report;
  const manual = rep.openingCash + (rep.byMethod.cash ?? 0) - rep.refunds;
  assert.equal(rep.expectedCash, Math.round(manual * 100) / 100);
  assert.ok(rep.sales >= 3);

  const held = await call('POST', '/admin/pos/held', { label: 'Table 2', payload: { lines: [{ variantId: 1, qty: 2 }] } });
  assert.equal(held.statusCode, 201);
  assert.equal((await call('GET', '/admin/pos/held')).json()[0].label, 'Table 2');
  assert.equal((await call('DELETE', `/admin/pos/held/${held.json().id}`)).statusCode, 200);
  assert.equal((await call('GET', '/admin/pos/held')).json().length, 0);

  const { strip } = await napa();
  const [{ barcode }] = await sql`SELECT barcode FROM product_variants WHERE id = ${strip.id}`;
  const byCode = (await call('GET', `/admin/pos/search?q=${barcode}`)).json();
  assert.equal(byCode[0].matchedVariantId, strip.id);
  assert.ok(byCode[0].packs.length >= 2);                                                 // strip, loose piece (box included when counter-sold)
  assert.ok((await call('GET', '/admin/pos/search?q=paracetamol')).json().length >= 3);   // by generic name
  const alts = (await call('GET', `/admin/pos/alternatives/${(await napa()).pid}`)).json();
  assert.ok(alts.length >= 2);

  const closed = await call('POST', '/admin/pos/shift/close', { countedCash: rep.expectedCash - 5 });
  assert.equal(closed.statusCode, 200);
  assert.equal(closed.json().difference, -5);
  assert.equal((await call('POST', '/admin/pos/shift/close', { countedCash: 0 })).statusCode, 409);
});
