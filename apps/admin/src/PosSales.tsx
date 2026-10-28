import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Receipt, type Sale } from './Receipt';
import { Icon, Pager, useErr } from './ui';
import { taka } from './Orders';

type Row = { id: number; invoiceNo: string; total: number; status: string; createdAt: string; cashier: string; customerName: string | null; customerPhone: string | null; items: number; methods: string | null };
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** Counter sales list with reprint, void and return. `modal` shows it as a dialog inside the POS screen. */
export function PosSales({ canVoid, modal, onClose }: { canVoid: boolean; modal?: boolean; onClose?: () => void }) {
  const errText = useErr();
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [q, setQ] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState('');
  const [retQty, setRetQty] = useState<Record<number, string>>({}); const [reason, setReason] = useState(''); const [mode, setMode] = useState<'view' | 'void' | 'return'>('view');
  const SIZE = 30;

  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), page: String(page), limit: String(SIZE) });
    api<{ items: Row[]; total: number }>('GET', `/pos/sales?${p}`).then((r) => { setRows(r.items); setTotal(r.total); }).catch((e) => setErr(errText(e)));
  }, [q, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 3000); return () => clearTimeout(id); }, [flash]);

  async function open(id: number) { setErr(''); setMode('view'); setReason(''); setRetQty({}); setSale(await api<Sale>('GET', `/pos/sales/${id}`)); }
  async function doVoid() {
    if (!sale) return; setErr('');
    try { await api('POST', `/pos/sales/${sale.id}/void`, { reason }); setFlash('Sale voided, stock restored'); await open(sale.id); load(); } catch (x) { setErr(errText(x)); }
  }
  async function doReturn() {
    if (!sale) return; setErr('');
    const items = Object.entries(retQty).map(([itemId, v]) => ({ itemId: Number(itemId), qty: Number(v) })).filter((i) => i.qty > 0);
    if (!items.length) return setErr('Enter a quantity to return');
    try { const r = await api<{ refund: number }>('POST', `/pos/sales/${sale.id}/return`, { items, reason }); setFlash(`Refund ${taka(r.refund)} · stock restored`); await open(sale.id); load(); } catch (x) { setErr(errText(x)); }
  }

  const body = (
    <section>
      <header className="pagehead"><div><h1>Counter sales</h1>{!modal && <p className="sub">Every bill rung up at the POS. Open one to reprint, void or take a return.</p>}</div>
        <div className="tools"><label className="searchbox"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice, phone or name" aria-label="Search sales" /></label>
          {modal && <button className="btn" onClick={onClose}>Close</button>}</div></header>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && !sale && <div className="notice err" role="alert">{err}</div>}
      <div className="panel"><table className="grid">
        <thead><tr><th>Invoice</th><th>Time</th><th>Customer</th><th className="r">Items</th><th className="r">Total</th><th>Paid by</th><th>Cashier</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => open(r.id)}>
              <td className="num strong">{r.invoiceNo}</td><td className="dim">{when(r.createdAt)}</td><td>{r.customerName ?? <span className="dim">—</span>} <span className="num dim">{r.customerPhone}</span></td>
              <td className="num r">{r.items}</td><td className="num r">{taka(r.total)}</td><td className="dim">{r.methods}</td><td className="dim">{r.cashier}</td>
              <td><span className={`pill ${r.status === 'voided' ? 'st-cancelled' : 'ok'}`}>{r.status === 'voided' ? 'Voided' : 'Completed'}</span></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="empty">No sales yet</td></tr>}
        </tbody>
      </table><Pager page={page} size={SIZE} total={total} onPage={setPage} noun="sales" /></div>

      {sale && (
        <div className="overlay top" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setSale(null); }}>
          <div className="dialog wide">
            <div className="dhead"><h2 className="num">{sale.invoiceNo} <span className={`pill ${sale.status === 'voided' ? 'st-cancelled' : 'ok'}`}>{sale.status === 'voided' ? 'Voided' : 'Completed'}</span></h2><button className="icon" aria-label="Close" onClick={() => setSale(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody salebody">
              <Receipt sale={sale} />
              <div className="saleside">
                {mode === 'view' && <>
                  <button className="btn primary block" onClick={() => window.print()}>Print receipt</button>
                  {canVoid && sale.status === 'completed' && <button className="btn block" onClick={() => setMode('return')}>Take a return</button>}
                  {canVoid && sale.status === 'completed' && <button className="btn block" onClick={() => setMode('void')}>Void whole bill</button>}
                </>}
                {mode === 'void' && <>
                  <p className="sub">Cancels the bill and puts all stock back. Only possible while the shift that made the sale is still open.</p>
                  <input aria-label="Reason" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn danger block" disabled={reason.trim().length < 3} onClick={doVoid}>Void sale</button><button className="btn block" onClick={() => setMode('view')}>Back</button>
                </>}
                {mode === 'return' && <>
                  <p className="sub">Enter how many of each pack come back. Stock returns to the original batch; the refund is paid from your open shift.</p>
                  {sale.items.map((i) => (
                    <div key={i.id} className="retrow"><span>{i.name} <span className="dim">{i.label}</span><br /><small className="dim">sold {i.qty}{i.returnedQty ? `, returned ${i.returnedQty}` : ''}</small></span>
                      <input aria-label={`Return ${i.name}`} type="number" min="0" max={i.qty - i.returnedQty} step="1" value={retQty[i.id] ?? ''} onChange={(e) => setRetQty({ ...retQty, [i.id]: e.target.value })} /></div>
                  ))}
                  <input aria-label="Reason" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn primary block" disabled={reason.trim().length < 3} onClick={doReturn}>Refund &amp; restock</button><button className="btn block" onClick={() => setMode('view')}>Back</button>
                </>}
                {err && <div className="notice err" role="alert">{err}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
  return modal ? <div className="overlay" role="dialog" aria-modal="true"><div className="dialog xwide" style={{ padding: 14 }}>{body}</div></div> : body;
}
