import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Icon, Pager, useErr } from './ui';
import { taka } from './Orders';

type Item = { variantId: number; name: string; strength: string | null; label: string; barcode: string | null; price: number; generic: string | null; company: string | null; stock: number; expired: number; batches: number; nearestExpiry: string | null };
type Batch = { id: number; batchNo: string; expiry: string; costPrice: number; qty: number; receivedAt: string; supplier: string | null; expired: boolean };

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const daysTo = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

export function Stock({ canEdit }: { canEdit: boolean }) {
  const errText = useErr();
  const [filter, setFilter] = useState(''); const [q, setQ] = useState('');
  const [data, setData] = useState<{ items: Item[]; total: number; lowStockAt: number; expiryWarnDays: number }>({ items: [], total: 0, lowStockAt: 10, expiryWarnDays: 60 });
  const [page, setPage] = useState(1);
  const SIZE = 50;
  const [sel, setSel] = useState<Item | null>(null); const [batches, setBatches] = useState<Batch[]>([]);
  const [adj, setAdj] = useState<{ batch: Batch; qty: string; reason: string; note: string } | null>(null);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(filter ? { filter } : {}), limit: String(SIZE), page: String(page) });
    api<typeof data>('GET', `/stock?${p}`).then(setData).catch((e) => setErr(errText(e)));
  }, [q, filter, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [q, filter]);
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);

  const openBatches = async (it: Item) => { setSel(it); setErr(''); setAdj(null); setBatches(await api<Batch[]>('GET', `/stock/${it.variantId}/batches`)); };
  async function saveAdj(e: React.FormEvent) {
    e.preventDefault(); if (!adj) return; setErr('');
    const n = Number(adj.qty);
    try {
      await api('POST', '/stock/adjust', { batchId: adj.batch.id, qty: adj.reason === 'adjustment' ? n : -Math.abs(n), reason: adj.reason, note: adj.note || undefined });
      setAdj(null); setFlash('Stock updated'); await openBatches(sel!); load();
    } catch (x) { setErr(errText(x)); }
  }
  const pill = (n: number) => <span className={`pill ${n === 0 ? 'st-cancelled' : n <= data.lowStockAt ? 'warn' : 'ok'}`}>{n}</span>;

  return (
    <section>
      <header className="pagehead"><div><h1>Stock</h1><p className="sub">Live balance per pack, from received batches minus sales. Low stock is {data.lowStockAt} or fewer; expiry warning is {data.expiryWarnDays} days.</p></div>
        <div className="tools"><label className="searchbox"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, generic or barcode" aria-label="Search stock" /></label></div></header>
      <div className="segs" role="tablist">
        {[['', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['expiring', 'Expiring soon']].map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && !sel && <div className="notice err" role="alert">{err}</div>}
      <div className="panel"><table className="grid">
        <thead><tr><th>Medicine</th><th>Pack</th><th>Barcode</th><th className="r">Price</th><th className="r">In stock</th><th className="r">Batches</th><th>Nearest expiry</th><th className="r">Expired units</th></tr></thead>
        <tbody>
          {data.items.map((i) => {
            const d = i.nearestExpiry ? daysTo(i.nearestExpiry) : null;
            return (
              <tr key={i.variantId} className="click" onClick={() => openBatches(i)}>
                <td className="strong">{i.name} <span className="dim">{i.strength}</span></td><td>{i.label}</td><td className="num dim">{i.barcode ?? '—'}</td><td className="num r">{taka(i.price)}</td>
                <td className="r">{pill(i.stock)}</td><td className="num r">{i.batches}</td>
                <td>{i.nearestExpiry ? <span className={d! <= data.expiryWarnDays ? 'warntext' : ''}>{fmtDate(i.nearestExpiry)}{d! <= data.expiryWarnDays && <span className="dim"> · {d}d</span>}</span> : <span className="dim">—</span>}</td>
                <td className="num r">{i.expired ? <span className="badtext">{i.expired}</span> : <span className="dim">0</span>}</td>
              </tr>
            );
          })}
          {!data.items.length && <tr><td colSpan={8} className="empty">Nothing matches</td></tr>}
        </tbody>
      </table><Pager page={page} size={SIZE} total={data.total} onPage={setPage} noun="packs" /></div>

      {sel && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="dialog wide">
            <div className="dhead"><h2>{sel.name} {sel.strength} <span className="dim">· {sel.label}</span></h2><button className="icon" aria-label="Close" onClick={() => setSel(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              <table className="grid flush"><thead><tr><th>Batch</th><th>Expiry</th><th>Supplier</th><th className="r">Cost</th><th className="r">On hand</th><th className="act" /></tr></thead><tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="num strong">{b.batchNo}</td><td>{fmtDate(b.expiry)} {b.expired && <span className="pill st-cancelled">Expired</span>}</td><td>{b.supplier ?? <span className="dim">—</span>}</td>
                    <td className="num r">{taka(b.costPrice)}</td><td className="num r">{b.qty}</td>
                    <td className="act">{canEdit && b.qty > 0 && <button className="btn" onClick={() => setAdj({ batch: b, qty: '', reason: b.expired ? 'expired_writeoff' : 'adjustment', note: '' })}>Adjust</button>}</td>
                  </tr>
                ))}
                {!batches.length && <tr><td colSpan={6} className="empty">No batches yet. Receive stock under Purchases.</td></tr>}
              </tbody></table>
              {adj && (
                <form className="adjform" onSubmit={saveAdj}>
                  <b>Adjust batch {adj.batch.batchNo}</b>
                  <select aria-label="Reason" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}>
                    <option value="adjustment">Stock count correction (+/−)</option><option value="expired_writeoff">Expired write-off</option><option value="return_supplier">Return to supplier</option>
                  </select>
                  <input aria-label="Quantity" required type="number" step="1" placeholder={adj.reason === 'adjustment' ? '+5 or −3' : 'Units removed'} value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} style={{ width: 120 }} />
                  <input aria-label="Note" placeholder="Note (optional)" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
                  <button className="btn primary">Apply</button><button type="button" className="btn" onClick={() => setAdj(null)}>Cancel</button>
                </form>
              )}
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
