import { sql } from '../db/client.js';

let cache: { at: number; map: Map<string, unknown> } | null = null;

/** Settings are read often (every product list) and change rarely, so keep them for a few seconds. */
async function all() {
  if (cache && Date.now() - cache.at < 5000) return cache.map;
  const rows = await sql`SELECT key, value FROM settings`;
  cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key as string, r.value])) };
  return cache.map;
}
export const invalidateSettings = () => { cache = null; };

export async function getThresholds() {
  const m = await all();
  return { lowStockAt: Number(m.get('low_stock_at') ?? 10), expiryWarnDays: Number(m.get('expiry_warn_days') ?? 60) };
}
export async function hideOutOfStock() {
  const v = (await all()).get('hide_out_of_stock');
  return v === undefined ? true : v === true || v === 'true';
}
